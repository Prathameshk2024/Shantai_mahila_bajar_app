# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

शांताई महिला बाजार / Shantai Mahila Bazar — a digital marketplace for rural women entrepreneurs in Maharashtra. Three user-facing surfaces, one API:

- **frontend/** — the seller + customer app (React/Vite, also shipped as a Capacitor APK)
- **admin/** — they console (React/Vite, deployed separately)
- **backend/** — Express API serving all three, including `/api/admin/*`
- **shared/** — domain types and rules imported by all of the above

Product spec: `docs/FEATURE-SPEC.md`. Deployment: `docs/DEPLOY.md`.

> `README.
md` still says "there is no admin UI in this repo". That is stale — `admin/` exists and is a full console. Trust this file and the code.

## Commands

```bash
npm install            # installs all four workspaces
npm run dev            # API :4000 + seller app :5173
npm run dev:all        # the above + admin console :5174
npm run dev:api        # API only
npm run dev:web        # seller app only
npm run dev:admin      # admin console only

npm test               # backend (176) + frontend (56) + admin (17) tests
npm run typecheck      # all three workspaces
npm run build          # backend tsc + both Vite builds

npm run admin          # interactive admin CLI (backend/scripts/admin.ts)
npm run admin:users -- list          # administrator accounts (create / passwd / disable)
npm run admin:users -- hash          # a password hash for ADMIN_BOOTSTRAP_PASSWORD_HASH
npm run backfill:customers -- --help
npm run purge:demo -- --help
```

Run a single test file — `node:test` via tsx, no framework:

```bash
cd backend && node --import tsx --test tests/session.test.ts
cd admin   && node --import tsx --test tests/i18n.test.ts
```

Vite proxies `/api` to `localhost:4000`, so nothing needs configuring in development. Reseed by deleting `backend/data/db.json` or `POST /api/dev/reset` (404s in production).

Demo logins: any 10-digit number, and the OTP screen **shows you the 6-digit code** — it is a real code that is really checked, so typing anything else is refused. Existing seller `9822011223` (Sunita, SMB-ANADUR-01). A customer phone with no name on record is authenticated but *not registered* — the app sends the seller to `/register/customer` to give one.

There is no default admin password any more. Make an account with `npm run admin:users -- create you@example.com "Your Name"`, or set `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH` on a host with no shell.

## Import convention — read this before writing any import

Cross-workspace imports use the `@shared/*` alias **with a `.js` extension on a `.ts` file**:

```ts
import type { Order } from '@shared/types.js'   // resolves to shared/src/types.ts
```

The backend is `module: NodeNext`, which requires the `.js` extension at runtime. The two Vite configs rewrite `@shared/<x>.js` → `shared/src/<x>.ts` with a regex alias. Dropping the `.js`, or writing `.ts`, breaks one side or the other. Local relative imports inside `frontend/` and `admin/` follow the same `.js` convention.

`shared/` is not built — it is consumed as TypeScript source. A change there is a compile error on whichever side has not caught up, which is the point.

## Architecture

### Persistence: one synchronous interface, two drivers

`backend/src/db/store.ts` exposes a **synchronous** `getDb()` backed by either Firestore or a JSON file, chosen by whether `FIREBASE_*` credentials are present. The entire dataset is loaded into memory at boot; `save()` schedules a diffed, batched write coalesced over 400ms.

Consequences that matter when changing anything in `backend/src/`:

- **`initStore()` must finish before the first request.** `index.ts` awaits it.
- **Writes are diffed, not blanket.** Only changed documents are sent. Do not introduce a code path that rewrites whole collections.
- **No single persist may delete more than half a collection.** `isBulkDelete()` in `firestore.ts` refuses it, keeps the documents, and logs loudly; `ALLOW_BULK_DELETE=true` on the one command that means it is the override. This exists because on 10 September 2026 a persist whose in-memory `sellers` and `products` were empty deleted six real sellers and thirteen products, recovered only from Firestore's one-hour version history. A refusal means memory and the server disagree — find out why before trusting that process.
- **This is correct for exactly ONE server process.** Two instances each hold their own snapshot and silently overwrite each other. Render is pinned to one instance; autoscaling must stay off. Outgrowing this means converting route handlers to async per-document reads — real work, not a config change.
- A Firestore connection failure at boot **falls back to the JSON file** and says so loudly. Reads and writes track the same `firestoreLive` flag so they can never disagree.
- An empty database stays empty unless `SEED_DEMO_DATA` is set. Never make seeding automatic — it would put invented sellers in front of real customers.

Firebase is **server-side only**, via `firebase-admin` with a service account. There is no Firebase Web SDK anywhere, and adding one would be an architectural change, not a convenience: `firestore.rules` denies all client-SDK access because every business rule (slot limits, legal order transitions, who may edit what) lives in the API.

### Sessions

`backend/src/auth/` is the whole stack; `middleware/auth.ts` composes it. The token is `base64url({sid, role, iat}).base64url(HMAC(payload))` signed with `SESSION_SECRET`.

**The token carries no identity.** `sid` points at a row in the `sessions` collection, and `req.auth.sellerId` is read from that row on every request — so a token cannot assert an identity the server did not issue, and deleting the row revokes it instantly. That is what makes logout and "the seller's phone was stolen" real.

- `auth/crypto.ts` is the only file that touches `node:crypto`. Every signature is **domain-separated by purpose**, so a registration ticket cannot be presented as a session token.
- **Registration requires a ticket.** `/sellers/register` takes the phone out of a single-use, 15-minute ticket from `/auth/otp/verify` and *ignores the one in the body*. Without it the endpoint minted a seller session for any phone number anybody typed.
- **OTP**: two paths, chosen in `config.ts` by which environment variables are set, and both end at the same `/auth/otp/verify`.
  - **MSG91 widget** (`MSG91_AUTH_KEY` + `MSG91_WIDGET_ID`) — what production uses, because it needs no DLT registration. The browser sends *and* checks the code, then hands back a JWT; `otp.providers.ts` trades that JWT for the number it was issued for and **refuses it unless it matches the phone in the request**. That comparison is the whole security of the path — a token only proves *some* number was verified. The frontend half is `lib/msg91Widget.ts`, using `exposeMethods: true` so the app keeps its own OTP screen rather than MSG91's English modal.
  - **Server-side** (no widget configured) — 6 digits from the CSPRNG, stored as an HMAC, single-use, 5-minute TTL, destroyed after 5 wrong guesses. Demo mode returns the code in the response so the app is walkable; it is a real code that is really checked, and production refuses to boot on this path.
  - `verifyOtp` checks `provider.verify` **before** the six-digit format test — a widget JWT is not six digits, and that ordering is what lets it through. `sendOtp` delivers nothing on the widget path - the SMS already went out from the browser - but the app calls `/auth/otp/send` **before** it asks the widget to send, because that route is where the per-number quota is counted. Skipping it made "three codes a day" a comment rather than a limit.
- **Rate limits** live in `auth/rateLimit.ts`, keyed by *both* subject and IP. This needs `app.set('trust proxy', 1)`; without it Render's balancer makes every request share one address.
- **Admins** are database records with scrypt hashes (`auth/admins.ts`), managed by `npm run admin:users`. There is no `ADMIN_PASSWORD`.
- **Idle windows, not absolute**: admin 8h, seller/customer 7 days. Different because the risk differs, and because re-issuing a seller's token costs an SMS. There is also an **absolute** ceiling (admin 7d, others 90d) so a copied token cannot be kept alive forever by being used.
- Past halfway through the window the server re-stamps the token onto the **`X-Session-Token`** response header; `frontend/src/lib/api.ts` and `admin/src/lib/api.ts` swap it in. This header must stay in the CORS `exposedHeaders` list or every session expires on a timer regardless of activity.
- `attachAuth` never rejects — `requireRole(...)` does, so public routes stay public.
- On the seller/customer app the refreshed token must reach **`wb.session`**, not just `wb.token`: `api.ts` publishes `onTokenRefresh`/`onSessionExpired` and `AuthContext` is the only subscriber. Writing it to `wb.token` alone means the next reload restores the original from `wb.session` and the slide is lost — the window then counts from login rather than from last use.
- **Only two things end a session**: Log out, and a 401. Back, refresh and re-entering `/seller` must never clear one, so the login screens redirect an already-signed-in matching role straight to its home instead of asking for an OTP again.

### Order state machine

`shared/src/orderFlow.ts` is the single source of truth:

```
PLACED → ACCEPTED → PACKED → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
```

Locked at six states. **Payment is a separate axis, not a step** — a cash order and a UPI order walk the same six screens. The backend validates transitions with `canTransition()`; the frontend draws its buttons from `SELLER_ACTIONS`. Neither hard-codes a status string, and new code should not either.

### Editing a published product

`PATCH /products/:id` is the only way a seller changes a listing after it exists, and it decides one thing: does the edit send the listing back to the admin queue?

`MODERATED_FIELDS` in `products.routes.ts` is the split, and it is by **what the admin was actually looking at when they approved it** — name, picture, category, ingredients, veg/non-veg. Price, stock, unit, MRP and made-to-order are deliberately absent: they change constantly, and pulling a shop off the shelf every time they mark eight jars left instead of ten teaches they to stop keeping the stock honest. `touchesModeratedContent()` compares values rather than keys, because the edit form posts the whole product on every save.

`DRAFT → PENDING` and `REJECTED → PENDING` are also allowed here — that is how a draft gets published — and both run the same `listingProblems()` check and slot gate as a new listing. A draft consumes no slot, so publishing one does. Without that gate "save as draft" would be the way around moderation.

The screen is `frontend/src/screens/seller/EditProduct.tsx`, and it is deliberately **not** the wizard: one question per screen is right when the job is teaching the seller what a listing needs, and wrong when they came to fix one number. `isFood` is immutable — it picks the category set and stamps the FSSAI licence, so changing it re-files the product under a licence nobody checked it against.

### The upload wizard's draft

A half-filled product is written to `localStorage` so that leaving the screen — most often to change the language from the seller's profile — does not throw the work away. `frontend/src/screens/seller/productDraft.ts` owns it.

The key is `wb.draft.product.<sellerId>` and the seller id is **also stored inside the payload**. The first version used one shared key, and on a field coordinator's phone, where seller after seller registers on the same handset, the next woman opened "New product" and found a stranger's photo on step 1. Nothing is written until `hasStarted()` is true, so opening the wizard and walking away leaves no trace, and `readDraft` deletes the old unkeyed `wb.draft.product` on sight.

### Product photos

`PhotoPicker` takes **one photo, from the gallery, and nothing else**. The camera button and the emoji fallback grid are both gone, so a photo is now required unless Cloudinary is off — the picker reports that upward through `onUnavailable` and the step stops being a wall the seller cannot pass. Once a photo is in, "choose from gallery" is disabled rather than silently replacing it; the ✕ on the thumbnail is the way to change it. The file input resets its own `value`, or removing a photo and picking the same file again fires no `change` event at all.

### Slots and subscription

`shared/src/seller.ts`. ₹50 = one pack = 5 product slots, no payment gateway — the seller pays their UPI and admin approves by hand. `SLOT_CONSUMING` deliberately excludes `DRAFT` (so they can experiment before paying) and `ARCHIVED` (so archiving frees a slot immediately). Validation functions here run on **both** sides: the client for a fast friendly message, server because the client can lie.

### Other shared modules

- `womenbiz.ts` — the `SMB-<VILLAGE>-<NN>` ID. The serial is **per village**, not global, so the code tells a field coordinator where to go. Non-survey villages are transliterated from Devanagari.
- `readiness.ts` — Digital Readiness Index. Six factors self-reported at registration (the day-one baseline), four **measured by the platform** from what the seller actually does. Keep that split; it is what makes the before/after comparison meaningful.

### Config and graceful degradation

`backend/src/config.ts` reads everything from the environment, and every integration degrades rather than crashing. With an empty `.env`: JSON-file database, emoji instead of photos, any 4-digit OTP. The boot banner (`describeConfig()`) prints what is actually live — check it before debugging a "broken" integration.

`SESSION_SECRET` is the one exception: a fixed development fallback, but the server **refuses to boot in production without it**.

`CORS_ORIGIN` is comma-separated and parsed into a **list**, because two front ends on different origins call one API. Handing a comma-joined string straight to `cors()` matches neither and blocks both.

Photos upload **direct from the browser to Cloudinary** via a short-lived signature from `/api/uploads/signature`; the bytes never pass through the server and the API secret never leaves it.

## Conventions

- **Errors** are `{ error, messageMr, fields? }`. Every user-facing failure carries a Marathi message. `ApiError` in the frontend api client surfaces all three.
- **No screen calls `fetch` directly** — `frontend/src/lib/api.ts` and `admin/src/lib/api.ts` are the only seams to the server.
- **i18n**: Marathi is the default, English the fallback. Every string goes through `t('key')` from `I18nProvider` — **placeholders included**, which is where they kept being missed: an English UI with a Marathi example inside the input is the same bug as an untranslated label. `frontend/tests/i18n.test.ts` asserts dictionary parity, that each dictionary is in its own language, that no component hard-codes a Devanagari `placeholder=`, and that every `t()` key a component asks for exists — a missing one renders as its own name, on screen, in both languages.
- **Tests** are `node:test` + `node:assert/strict`, run through tsx. They read as prose explaining *why* a rule exists — match that when adding one.
- Comments here explain reasoning and trade-offs, not mechanics. Follow suit rather than narrating what the code already says.

## Design rules (constraints, not preferences)

From spec section 6, encoded in `frontend/src/styles/theme.css`:

- Status is colour **+ icon + word**, never colour alone. Every icon carries a word.
- 16px minimum text, 56px buttons, 44px touch targets.
- Four bottom tabs, one level deep. **No hamburger menu.**
- One question per screen in wizards, with progress dots. **Editing is not a wizard** — `EditProduct` puts every field on one page, because four taps between the seller and a price they came to change is not simplicity.
- Confirmation dialogs state the consequence, never a bare "Are you sure?"
- Latin digits (₹500, not ५००) — that is what is printed on money.
- **No web fonts.** Android ships Noto Sans Devanagari, so Marathi renders from system fonts at zero network cost and the APK works offline.
- `theme.css` opens with a `:root` block marked **THEME SWAP POINT**; every colour, size and radius comes from those tokens, so retheming is a change to that block alone.

Voice input (`frontend/src/lib/useVoiceInput.ts`) wraps the Web Speech API and is an **addition** — the keyboard is never removed, and the mic simply does not render where speech is unsupported. Every `VoiceInput` owns its own mic and dictates into itself; there is no app-wide microphone.

Icons come from `react-icons` through `frontend/src/components/icons.tsx`, which is the only file that names a vendor icon. Emoji that survive are **data** — a seller's avatar, the veg/non-veg marks — not chrome. The landing page's category tiles are photographs now, not emoji.

The brand mark is a portrait of कै. शांताबाई (काकी) सिद्रामप्पा आलुरे, the woman the market is named for. `frontend/src/assets/logo.png` and `admin/src/assets/logo.png` are the same mark; both apps also carry it as a favicon from their `public/` folder. It already contains its own gold ring, so never give it a border or a background — either prints a second ring.

Both landing photo strips are one component, `PhotoRotator`, cross-fading every two seconds and holding on the first frame under `prefers-reduced-motion`.

## Deployment shape

One Render web service (the API, **one instance**) and two Vercel projects from this same repo, distinguished only by Root Directory (`frontend` and `admin`). `VITE_API_URL` is read at **build** time, so changing it means redeploying. `frontend/vite.config.ts` sets `base: './'` for the Capacitor WebView; `admin` deliberately does not.

Do not use Firebase Dynamic Links — it shut down on 25 August 2025. Deferred deep linking uses Android App Links plus the Play Install Referrer API.

## Not built yet

Reviews · chat · push notifications · disputes · returns and refunds · coupons · real camera capture · QR decoding · courses and certificates · the seller's own address book.