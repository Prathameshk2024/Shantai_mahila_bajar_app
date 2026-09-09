import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { firebase } from '../config.js'
import type { Db } from './seed.js'

/**
 * FIRESTORE DRIVER
 * ================
 * Loads every collection into memory on boot and writes changes back.
 *
 * Why a snapshot rather than per-request reads: the whole app reads through a
 * synchronous `getDb()` in 33 places across the route files. Making each of
 * those an awaited Firestore query would be a rewrite of every handler, and
 * would also turn one page load into dozens of billed reads. For a programme
 * sized in hundreds of sellers the entire dataset is a few hundred kilobytes,
 * so holding it in memory is both simpler and far cheaper.
 *
 * Writes are DIFFED, not blanket. Only documents that actually changed are
 * sent, batched, and coalesced over 400ms — otherwise a single order update
 * would rewrite every seller and burn the free-tier write quota.
 *
 * >>> THE LIMITATION, STATED PLAINLY <<<
 * This is correct for ONE server process. If you ever run two instances (Cloud
 * Run autoscaling, two dynos), each holds its own snapshot and they will
 * overwrite each other. At that point the fix is to convert the route handlers
 * to async per-document reads. Until then, pin the deployment to a single
 * instance — `--max-instances=1` on Cloud Run.
 */

/**
 * `addresses` is deliberately absent. It used to hold two seeded demo
 * addresses that every customer was shown as if they were her own; addresses
 * now live inside each customer document. Dropping the name from this list
 * stops the collection being read or diffed - the existing documents are left
 * in Firestore untouched, so restoring this entry is the whole rollback.
 */
const COLLECTIONS = [
  'sellers', 'products', 'orders', 'payments', 'customers',
  // Auth state. `firestore.rules` already denies every client-SDK read, which
  // matters more for these three than for anything else in the list: `admins`
  // holds password hashes and `sessions` holds live credentials.
  'sessions', 'admins', 'authEvents',
] as const
type CollectionName = (typeof COLLECTIONS)[number]

let db: Firestore | null = null

export function getFirestoreDb(): Firestore {
  if (db) return db
  if (!firebase) throw new Error('Firebase is not configured')

  if (!getApps().length) {
    // No clientEmail means Application Default Credentials: the token cached by
    // `gcloud auth application-default login`, belonging to a human account.
    const credential =
      firebase.clientEmail && firebase.privateKey
        ? cert({
            projectId: firebase.projectId,
            clientEmail: firebase.clientEmail,
            privateKey: firebase.privateKey,
          })
        : applicationDefault()

    initializeApp({ credential, projectId: firebase.projectId })
  }

  db = firebase.databaseId ? getFirestore(firebase.databaseId) : getFirestore()
  db.settings({ ignoreUndefinedProperties: true })
  return db
}

/** Snapshot of what is on the server, so we can send only real changes. */
const persisted = new Map<CollectionName, Map<string, string>>()

function snapshotOf(list: { id: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const doc of list) m.set(doc.id, JSON.stringify(doc))
  return m
}

/** Read everything once. Returns null when the database is empty. */
export async function loadAll(): Promise<Db | null> {
  const fs = getFirestoreDb()
  const out: Partial<Db> = {}
  let total = 0

  for (const name of COLLECTIONS) {
    const snap = await fs.collection(name).get()
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    total += rows.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(out as any)[name] = rows
    persisted.set(name, snapshotOf(rows as { id: string }[]))
  }

  if (total === 0) return null
  return out as Db
}

/** Write the seed into an empty database, so a fresh project is usable. */
export async function seedInto(data: Db): Promise<void> {
  const fs = getFirestoreDb()
  let batch = fs.batch()
  let n = 0

  for (const name of COLLECTIONS) {
    for (const doc of data[name] as { id: string }[]) {
      batch.set(fs.collection(name).doc(doc.id), doc)
      if (++n === 450) {
        await batch.commit()
        batch = fs.batch()
        n = 0
      }
    }
    persisted.set(name, snapshotOf(data[name] as { id: string }[]))
  }
  if (n > 0) await batch.commit()
  console.log('[firestore] seeded an empty database')
}

/**
 * Persist only what changed since the last write.
 * Returns how many documents were written and deleted, for the log line.
 */
export async function persistDiff(data: Db): Promise<{ written: number; deleted: number }> {
  const fs = getFirestoreDb()
  let batch = fs.batch()
  let pending = 0
  let written = 0
  let deleted = 0

  async function flushIfFull() {
    if (++pending >= 450) {
      await batch.commit()
      batch = fs.batch()
      pending = 0
    }
  }

  for (const name of COLLECTIONS) {
    const current = data[name] as { id: string }[]
    const before = persisted.get(name) ?? new Map<string, string>()
    const after = snapshotOf(current)

    for (const [id, json] of after) {
      if (before.get(id) !== json) {
        batch.set(fs.collection(name).doc(id), JSON.parse(json) as Record<string, unknown>)
        written++
        await flushIfFull()
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) {
        batch.delete(fs.collection(name).doc(id))
        deleted++
        await flushIfFull()
      }
    }
    persisted.set(name, after)
  }

  if (pending > 0) await batch.commit()
  return { written, deleted }
}
