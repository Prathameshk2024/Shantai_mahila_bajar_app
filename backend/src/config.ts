/**
 * Credentials and feature switches, read from the environment only.
 *
 * Nothing here is ever committed. Copy backend/.env.example to backend/.env
 * and fill it in; .env is already gitignored.
 *
 * Every integration degrades instead of crashing: with no Firebase the app
 * persists to backend/data/db.json exactly as before, and with no Cloudinary
 * the product wizard falls back to the emoji picker. That matters because you
 * should be able to clone this repo and run it without any accounts at all.
 */

function firstOf(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]
    if (v && v.trim()) return v.trim()
  }
  return undefined
}

/* ------------------------------------------------------------------ */
/* Firebase / Firestore                                                */
/* ------------------------------------------------------------------ */

export interface FirebaseConfig {
  projectId: string
  /**
   * Absent under Application Default Credentials, where the identity comes
   * from the gcloud login on this machine rather than from a stored key.
   */
  clientEmail?: string
  privateKey?: string
  databaseId?: string
}

function readFirebase(): FirebaseConfig | null {
  const databaseId = firstOf('FIRESTORE_DATABASE_ID')

  // A real service account always wins over the gcloud login below. Otherwise
  // a leftover FIREBASE_USE_ADC=true from local development would silently
  // shadow the key on a deployed server, and production would be running on
  // somebody's personal Google account without anyone noticing.
  //
  // Two accepted shapes: the three separate fields, or the whole service
  // account JSON in one variable (which is what most hosts hand you).
  const raw = firstOf('FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_SERVICE_ACCOUNT_JSON')
  if (raw) {
    try {
      const json = JSON.parse(
        // Some dashboards store it base64-encoded.
        raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'),
      ) as Record<string, string>
      if (json.project_id && json.client_email && json.private_key) {
        return {
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key.replace(/\\n/g, '\n'),
          databaseId,
        }
      }
    } catch {
      console.warn('[config] FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64 JSON')
    }
  }

  const projectId = firstOf('FIREBASE_PROJECT_ID')
  const clientEmail = firstOf('FIREBASE_CLIENT_EMAIL')
  // Private keys carry newlines. In a .env they arrive as literal \n.
  const privateKey = firstOf('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n')

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey, databaseId }
  }

  // Last resort: Application Default Credentials, from
  // `gcloud auth application-default login`. That signs in as a HUMAN Google
  // account and caches the token outside the repo, so there is no key to store
  // - only the project id.
  //
  // Opt-in rather than automatic, because a bare FIREBASE_PROJECT_ID on a
  // machine with no gcloud install would otherwise send boot down this path
  // and fail, when falling back to the JSON file is the friendlier answer.
  //
  // DEVELOPMENT ONLY. A deployed server has no human to log in, and the token
  // expires; production needs one of the two service account shapes above.
  if (/^(1|true|yes)$/i.test(firstOf('FIREBASE_USE_ADC') ?? '')) {
    if (!projectId) {
      console.warn('[config] FIREBASE_USE_ADC is set but FIREBASE_PROJECT_ID is empty')
      return null
    }
    // Not IS_PROD: that is declared below, and readFirebase() runs first.
    if (process.env.NODE_ENV === 'production') {
      console.warn('[config] FIREBASE_USE_ADC in production - use a service account instead')
    }
    return { projectId, databaseId }
  }

  return null
}

export const firebase = readFirebase()
export const usingFirestore = firebase !== null
/** True when credentials come from the gcloud login rather than from a key. */
export const usingAdc = firebase !== null && !firebase.clientEmail

/* ------------------------------------------------------------------ */
/* Cloudinary                                                          */
/* ------------------------------------------------------------------ */

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
  folder: string
}

/**
 * Accepts either CLOUDINARY_URL (`cloudinary://key:secret@cloud`) or the three
 * fields separately. The URL form is what Cloudinary's dashboard gives you.
 */
function readCloudinary(): CloudinaryConfig | null {
  const folder = firstOf('CLOUDINARY_FOLDER') ?? 'shanta-mahila-bazar'
  const url = firstOf('CLOUDINARY_URL')

  if (url) {
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url)
    if (m) {
      return {
        apiKey: m[1]!,
        apiSecret: m[2]!,
        cloudName: m[3]!.replace(/\/.*$/, ''),
        folder,
      }
    }
    console.warn('[config] CLOUDINARY_URL is malformed; expected cloudinary://key:secret@cloud')
  }

  const cloudName = firstOf('CLOUDINARY_CLOUD_NAME')
  const apiKey = firstOf('CLOUDINARY_API_KEY')
  const apiSecret = firstOf('CLOUDINARY_API_SECRET')
  if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret, folder }

  return null
}

export const cloudinary = readCloudinary()
export const usingCloudinary = cloudinary !== null

/* ------------------------------------------------------------------ */
/* Everything else                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Session signing                                                     */
/* ------------------------------------------------------------------ */

/**
 * The key session tokens are signed with. Sessions carry a customer id, and a
 * customer id now unlocks her saved home addresses - so an unsigned token
 * would let anyone read anyone's address by editing a base64 string.
 *
 * Development gets a fixed fallback so the repo still runs with no .env at
 * all. Production does not: booting with a known key would be the same as
 * having no signature.
 */
function readSessionSecret(): string {
  const secret = firstOf('SESSION_SECRET')
  if (secret) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is required in production. Generate one with:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
  }
  console.warn('[config] SESSION_SECRET is not set - using the development key')
  return 'dev-only-insecure-session-secret'
}

export const SESSION_SECRET = readSessionSecret()

/**
 * Whether an EMPTY database should be filled with the demo sellers and
 * products in seed.ts.
 *
 * Off unless asked for. It used to be automatic, which is right for a fresh
 * clone and badly wrong for a live one: customers would be shown three
 * invented women and eleven invented products alongside the real ones, and a
 * single empty read would be enough to put them there.
 */
export const SEED_DEMO_DATA = /^(1|true|yes)$/i.test(firstOf('SEED_DEMO_DATA') ?? '')

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

/**
 * Which browser origins may call this API.
 *
 * Two front ends share one backend - the seller/customer app and the admin
 * site, deployed separately - so this has to be a LIST. An environment
 * variable is a single string, and handing
 * "https://a.vercel.app,https://b.vercel.app" straight to `cors()` makes it one
 * literal origin that matches neither, blocking both sites at once.
 *
 * Unset means "any origin", which is what lets a fresh clone run with no
 * configuration at all. In production that is too open, so index.ts warns.
 */
export function parseCorsOrigin(raw: string | undefined): string[] | true {
  const trimmed = raw?.trim()
  if (!trimmed || trimmed === '*') return true

  const origins = trimmed
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '')) // an Origin header carries no path
    .filter(Boolean)

  return origins.length > 0 ? origins : true
}

export const CORS_ORIGIN = parseCorsOrigin(process.env.CORS_ORIGIN)

export const PORT = Number(process.env.PORT ?? 4000)
export const ADMIN_EMAIL = firstOf('ADMIN_EMAIL') ?? 'admin@shantabazar.in'
export const ADMIN_PASSWORD = firstOf('ADMIN_PASSWORD') ?? 'changeme'
export const IS_PROD = process.env.NODE_ENV === 'production'

export function describeConfig(): string {
  const lines = [
    `  Database       ${
      usingFirestore
        ? `Firestore (${firebase!.projectId})${usingAdc ? ' via gcloud login' : ''}`
        : 'JSON file (backend/data/db.json)'
    }`,
    `  Images         ${usingCloudinary ? `Cloudinary (${cloudinary!.cloudName})` : 'off - emoji only'}`,
    `  OTP            ${process.env.MSG91_AUTH_KEY ? 'MSG91' : 'demo (any 4 digits)'}`,
    `  CORS           ${CORS_ORIGIN === true ? 'any origin' : CORS_ORIGIN.join(', ')}`,
  ]
  if (IS_PROD && CORS_ORIGIN === true) {
    lines.push('  ⚠  CORS_ORIGIN is unset - any website can call this API from a browser.')
  }
  if (IS_PROD && ADMIN_PASSWORD === 'changeme') {
    lines.push('  ⚠  ADMIN_PASSWORD is still the default. Set it before going live.')
  }
  return lines.join('\n')
}
