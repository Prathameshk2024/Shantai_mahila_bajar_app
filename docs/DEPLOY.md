# Deployment — Cloud Run + two Vercel projects

The shape:

```
       Cloud Run                        Vercel project 1
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

## 1. Cloud Run — the API

The live service:

| | |
|---|---|
| Service | `shantai-api` |
| Region | `asia-south1` (Mumbai) |
| URL | `https://shantai-api-204453348000.asia-south1.run.app` |

**How the container is built is not recorded in this repo.** There is no
Dockerfile and no `cloudbuild.yaml`, so the build lives in someone's shell
history or in the Cloud Console. Whoever deploys next: write the exact command
here. What the repo does say is the build and start step:

```bash
npm ci && npm --workspace @shantai/backend run build
npm --workspace @shantai/backend run start
```

### Two settings that are not Cloud Run's defaults

| Setting | Value | Default | Why |
|---|---|---|---|
| Maximum instances | **1** | 100 | See the warning below. |
| CPU allocation | **Always allocated** | Only during requests | `save()` writes 400 ms *after* the response is sent. With the default, Cloud Run takes the CPU away the moment the response goes, and the write waits for the next request or for shutdown. |

Neither is visible from outside the service, so check them rather than assume:

```bash
gcloud run services describe shantai-api --region asia-south1 --project <PROJECT_ID>
```

Look for `autoscaling.knative.dev/maxScale: '1'` and
`run.googleapis.com/cpu-throttling: 'false'`. To set both:

```bash
gcloud run services update shantai-api --region asia-south1 --project <PROJECT_ID> \
  --max-instances 1 --no-cpu-throttling
```

`<PROJECT_ID>` is the project's name, not the number in the URL — gcloud
refuses the number.

### ⚠ Exactly one instance. Not two.

`backend/src/db/firestore.ts` loads the whole database into memory at boot and
writes changes back. That is deliberate and documented there, and it is correct
for **one** process only. Two instances each hold their own snapshot and
overwrite each other's writes — orders vanish, sellers reappear after deletion,
and nothing in the logs says why.

So: **maximum instances stays at 1.** If you outgrow one instance, the fix is
to convert the route handlers to async per-document Firestore reads first. It
is a real piece of work, not a config change.

**A deploy is the one moment the ceiling does not hold.** Maximum instances is
counted per revision, and a new revision starts and takes traffic before the
old one has finished draining — for a few seconds there are two processes.
Every deploy, and every environment-variable change (which is a deploy), does
this. Do it when nobody is placing orders, not in the evening.

### Environment variables

Set these on the service (Console → *Edit & deploy new revision* → *Variables
& Secrets*). Cloud Run sets `PORT` itself and `config.ts` reads it — do not set
it. The four marked secret belong in Secret Manager rather than as plain
variables, where anyone with viewer access to the project can read them.

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | **Secret. Required.** The server refuses to boot without it. Generate a fresh one, do not reuse your local value. Changing it later signs every user out. |
| `FIREBASE_SERVICE_ACCOUNT` | **Secret.** The whole service-account JSON on one line. |
| `CLOUDINARY_URL` | **Secret.** `cloudinary://key:secret@cloud` from the Cloudinary dashboard. |
| `CLOUDINARY_FOLDER` | `shanta-mahila-bazar` |
| `CORS_ORIGIN` | Both Vercel URLs, comma-separated. See §3. |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD_HASH` | First sign-in only, while no administrator exists. Make the hash locally with `npm run admin:users -- hash` — Cloud Run has no shell to run it in. Remove both once a real account exists. There is no `ADMIN_PASSWORD`. |
| `MSG91_AUTH_KEY` | **Secret.** The account Auth Key, and the only thing that can check a widget token. Never copy it into a `VITE_*` variable. |
| `MSG91_WIDGET_ID` | The OTP widget's id. With `MSG91_AUTH_KEY` this selects the widget, which needs no DLT registration. |
| `MSG91_TEMPLATE_ID` / `MSG91_SENDER` | Only for your own DLT-approved template. Leave unset while using the widget. |
| `SEED_DEMO_DATA` | Leave unset. Setting it would put invented sellers in front of real customers. |
| `ALLOW_BULK_DELETE` | Leave unset. It is for one command run by hand, never for the service. |

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Cold starts

With minimum instances at 0, Cloud Run stops an idle instance, and the next
request waits while a new one boots — and boot here means loading the **whole
database** from Firestore before the first request is answered. For a seller on
a rural connection that wait reads as a broken app. `--min-instances 1` keeps
one warm and is billed for it.

Stopping itself is safe: Cloud Run sends `SIGTERM` ten seconds before it kills
an instance, and `backend/src/index.ts` flushes pending writes on it, so the
400 ms write-coalescing window is not lost.

---

## 2. Vercel — two projects, one repo

Create **two** Vercel projects from the same repository. The only difference is
the Root Directory.

| | Project 1 | Project 2 |
|---|---|---|
| Root Directory | `frontend` | `admin` |
| Framework preset | Vite | Vite |
| Environment variables | `VITE_API_URL=https://shantai-api-204453348000.asia-south1.run.app`<br>`VITE_MSG91_WIDGET_ID=...`<br>`VITE_MSG91_TOKEN_AUTH=...` | `VITE_API_URL` only |

Vercel detects the npm workspaces and installs from the repo root, so `shared/`
resolves normally. Your local `.env` files are gitignored, so Vercel sees none
of them — every value above is typed into the dashboard.

Two Root Directory settings matter here, and both are in *Settings → Build and
Deployment → Root Directory*:

- **Include source files outside of the Root Directory** must stay **on** (it
  is, by default). Both apps read `../shared/src` straight off disk; with it off
  the build fails because `tsc` cannot find it.
- **Skip deployment** can stay on, because `frontend/package.json` and
  `admin/package.json` both declare `"@shantai/shared": "*"`. That line is how
  Vercel knows a commit to `shared/` alone affects them. Remove it and such a
  commit deploys neither app.

**Production is the branch Vercel is told it is** — `main` unless changed in
*Settings → Git*. Pushing any other branch makes a preview deployment, on its
own URL, which §3 will then block.

### Both projects need their `vercel.json` — it is already in the repo

`frontend/vercel.json` and `admin/vercel.json` each hold one rewrite:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Both apps route in the browser. Vercel knows nothing about `/seller/orders` or
`/payments`, so without this, **reloading any page other than the home page
returns 404** — the first thing anyone does after being sent a link. Static
files are matched before rewrites, so `/assets/…` still serves the real bundle.

The seller app needed a second half to that fix. It builds with `base: './'`
for Capacitor, and on the web a relative path is resolved against the current
directory: reloading `/seller/orders` asks for `/seller/assets/index-xxx.js`,
the rewrite answers with `index.html`, and a script tag receiving HTML is a
blank screen. `frontend/vite.config.ts` now picks `'/'` unless the build is
`--mode capacitor`, so the web build is absolute and the APK build is
relative. Nothing to configure in Vercel; the default `npm run build` is the
web build.

Every `VITE_*` value is read at **build** time, not run time — changing one
means redeploying, not just restarting. The admin console has no login OTP, so
the MSG91 pair belongs to project 1 alone.

The two MSG91 values here are public by design; the browser cannot run the
widget without them. **`MSG91_AUTH_KEY` is not one of them** — it lives on
Cloud Run only. Anything named `VITE_*` is inlined into the JS bundle that
ships to every phone, so putting the auth key here would publish it.

MSG91's widget settings restrict which domains may use it. Add the Vercel URL
there, or the widget loads and then refuses to send.

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
- **gcloud splits `--update-env-vars` on commas too**, so the obvious command
  sets `CORS_ORIGIN` to the first URL and treats the second as a malformed
  variable. Change the delimiter with gcloud's `^;^` prefix:

  ```bash
  gcloud run services update shantai-api --region asia-south1 --project <PROJECT_ID> \
    --update-env-vars "^;^CORS_ORIGIN=https://shanta-bazar.vercel.app,https://shanta-admin.vercel.app"
  ```

Confirm it on boot — the banner prints what is active, in the service's
*Logs* tab:

```
  Database       Firestore (shantaimahilabajar)
  Images         Cloudinary (wvd4cteq)
  OTP            MSG91 widget (356a4b...)
  CORS           https://shanta-bazar.vercel.app, https://shanta-admin.vercel.app
```

`OTP  demo (code shown on screen)` on a production host means the widget did
not configure and the API should not have booted — check both `MSG91_AUTH_KEY`
and `MSG91_WIDGET_ID` are set, since either alone falls back.

---

## 4. Order of operations

CORS needs the Vercel URLs, and Vercel needs the API URL, so it takes two
passes:

1. Deploy the API to Cloud Run with maximum instances 1 and CPU always
   allocated. Set everything except `CORS_ORIGIN`.
2. Deploy both Vercel projects with `VITE_API_URL` pointing at Cloud Run, and
   the `VITE_MSG91_*` pair on project 1.
3. Set `CORS_ORIGIN` on Cloud Run to the two Vercel URLs (the `^;^` command in
   §3). That makes a new revision — the same quiet-moment rule applies.
4. Add the project-1 Vercel URL to the MSG91 widget's allowed domains.
5. Deploy the Firestore rules: `firebase deploy --only firestore:rules`.
6. Check the boot banner shows Firestore, Cloudinary, the MSG91 widget and both
   origins.
7. Log in once on a real phone. The widget path is the one thing here that
   cannot be verified from the banner alone.

---

## 5. Before real users

- [ ] `SESSION_SECRET` set to a fresh random value — changing it later signs every user out
- [ ] MSG91 configured — **the API refuses to boot in production without it**, because demo mode returns the login code in the HTTP response
- [ ] `VITE_MSG91_WIDGET_ID` + `VITE_MSG91_TOKEN_AUTH` set on the Vercel frontend project, and the Vercel URL added to the widget's allowed domains
- [ ] `MSG91_AUTH_KEY` appears **only** on Cloud Run, never in a `VITE_*` variable
- [ ] The auth key committed in `.env.example` at `a0775b7` has been rotated — deleting the line did not revoke it
- [ ] `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH` set for the first sign-in (`npm run admin:users -- hash`), then removed once a real administrator exists
- [ ] `CORS_ORIGIN` set to both origins
- [ ] Cloud Run maximum instances is 1
- [ ] Cloud Run CPU is always allocated (`cpu-throttling: 'false'`)
- [ ] `firestore.rules` deployed
- [ ] `SEED_DEMO_DATA` unset
- [ ] `robots.txt` with `Disallow: /` on the admin project

---

## 6. The Android build

The APK is Capacitor wrapping `frontend/`. It has no dev server to proxy
through, so `VITE_API_URL` **must** be set at build time:

```bash
cd frontend
VITE_API_URL=https://shantai-api-204453348000.asia-south1.run.app npm run cap:sync
npm run cap:open
```

`cap:sync` builds with `--mode capacitor`, which is what switches `base` to
`'./'`. Building the APK with a plain `npm run build` produces absolute
`/assets/…` paths, and the WebView — which loads from the filesystem, with no
server root — finds nothing at all: a white screen on launch, with no error
that names the cause. Always go through `cap:sync`.

On Windows the `VITE_API_URL=… ` prefix is a POSIX shell form; use Git Bash, or
put the value in `frontend/.env` and run `npm run cap:sync` on its own.

A WebView origin is not an `https://` site, so CORS applies differently there —
if requests from the APK are blocked, that is the thing to look at first.
