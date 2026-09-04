# Deployment — Render + two Vercel projects

The shape:

```
        Render                          Vercel project 1
   ┌──────────────────┐            ┌──────────────────────┐
   │  Express API     │ ◄───────── │  seller + buyer app  │   frontend/
   │  + Firestore     │            └──────────────────────┘
   │  + Cloudinary    │            Vercel project 2
   │                  │ ◄───────── ┌──────────────────────┐
   └──────────────────┘            │  admin site          │   admin/
                                   └──────────────────────┘
```

One backend, two front ends, three deployments — all from this one repository.
Each Vercel project points at a different **Root Directory**, so they build and
deploy independently while still sharing `shared/src/types.ts`.

---

## 1. Render — the API

**Service type:** Web Service, from this repo.

| Setting | Value |
|---|---|
| Root Directory | *(repo root — leave blank)* |
| Build Command | `npm ci && npm --workspace @shantai/backend run build` |
| Start Command | `npm --workspace @shantai/backend run start` |
| Instance count | **1 — see the warning below** |

### ⚠ Exactly one instance. Not two.

`backend/src/db/firestore.ts` loads the whole database into memory at boot and
writes changes back. That is deliberate and documented there, and it is correct
for **one** process only. Two instances each hold their own snapshot and
overwrite each other's writes — orders vanish, sellers reappear after deletion,
and nothing in the logs says why.

So: **do not enable autoscaling on this service.** If you outgrow one instance,
the fix is to convert the route handlers to async per-document Firestore reads
first. It is a real piece of work, not a config change.

### Environment variables

Set these in the Render dashboard. Render injects `PORT` itself — do not set it.

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | **Required.** The server refuses to boot without it. Generate a fresh one, do not reuse your local value. |
| `FIREBASE_SERVICE_ACCOUNT` | The whole service-account JSON on one line. |
| `CLOUDINARY_URL` | `cloudinary://key:secret@cloud` from the Cloudinary dashboard. |
| `CLOUDINARY_FOLDER` | `shanta-mahila-bazar` |
| `CORS_ORIGIN` | Both Vercel URLs, comma-separated. See §3. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | **Change the password.** It is the only thing guarding the admin API. |
| `MSG91_AUTH_KEY` / `MSG91_TEMPLATE_ID` / `MSG91_SENDER` | Without these any 4-digit code logs in as anyone. |
| `SEED_DEMO_DATA` | Leave unset. Setting it would put invented sellers in front of real customers. |

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### The free tier sleeps

A free Render service spins down after ~15 minutes idle, and the next request
waits ~50 seconds while it wakes. For a seller on a rural connection that reads
as a broken app. The paid tier removes it.

Sleeping itself is safe: `backend/src/index.ts` flushes pending writes on
`SIGTERM`, which is what Render sends first, so the 400 ms write-coalescing
window is not lost.

---

## 2. Vercel — two projects, one repo

Create **two** Vercel projects from the same repository. The only difference is
the Root Directory.

| | Project 1 | Project 2 |
|---|---|---|
| Root Directory | `frontend` | `admin` |
| Framework preset | Vite | Vite |
| Environment variable | `VITE_API_URL=https://<your-api>.onrender.com` | same value |

Vercel detects the npm workspaces and installs from the repo root, so `shared/`
resolves normally. No extra configuration is needed.

`VITE_API_URL` is read at **build** time, not run time — changing it means
redeploying, not just restarting.

In development neither app needs it: `vite.config.ts` proxies `/api` to
`localhost:4000`.

---

## 3. CORS — the part that is easy to get wrong

`CORS_ORIGIN` is **comma-separated**, because two different origins call this
API:

```
CORS_ORIGIN=https://shanta-bazar.vercel.app,https://shanta-admin.vercel.app
```

Rules worth knowing:

- **No trailing slashes.** An `Origin` header never carries a path. They are
  stripped for you, but do not rely on it elsewhere.
- **Leaving it blank means any origin.** Fine locally, too open in production —
  the boot banner prints a warning when `NODE_ENV=production` and it is unset.
- **Vercel preview deployments get their own URLs** (`...-git-branch-....vercel.app`)
  and will be blocked. Either add the ones you use, or test previews against a
  separate API.

Confirm it on boot — the banner prints what is active:

```
  Database       Firestore (shantaimahilabajar)
  Images         Cloudinary (wvd4cteq)
  OTP            MSG91
  CORS           https://shanta-bazar.vercel.app, https://shanta-admin.vercel.app
```

---

## 4. Order of operations

CORS needs the Vercel URLs, and Vercel needs the API URL, so it takes two
passes:

1. Deploy the API to Render. Set everything except `CORS_ORIGIN`.
2. Deploy both Vercel projects with `VITE_API_URL` pointing at Render.
3. Set `CORS_ORIGIN` on Render to the two Vercel URLs. Render restarts.
4. Deploy the Firestore rules: `firebase deploy --only firestore:rules`.
5. Check the boot banner shows Firestore, Cloudinary, MSG91 and both origins.

---

## 5. Before real users

- [ ] `ADMIN_PASSWORD` changed from `changeme`
- [ ] `SESSION_SECRET` set to a fresh random value
- [ ] MSG91 configured — otherwise any 4 digits logs in as anyone
- [ ] `CORS_ORIGIN` set to both origins
- [ ] Render instance count is 1, autoscaling off
- [ ] `firestore.rules` deployed
- [ ] `SEED_DEMO_DATA` unset
- [ ] `robots.txt` with `Disallow: /` on the admin project

---

## 6. The Android build

The APK is Capacitor wrapping `frontend/`. It has no dev server to proxy
through, so `VITE_API_URL` **must** be set at build time:

```bash
cd frontend
VITE_API_URL=https://<your-api>.onrender.com npm run cap:sync
npm run cap:open
```

A WebView origin is not an `https://` site, so CORS applies differently there —
if requests from the APK are blocked, that is the thing to look at first.
