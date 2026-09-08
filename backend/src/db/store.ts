import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Db, seed } from './seed.js'

/**
 * Persistence.
 *
 * A JSON file on disk, loaded once and written after every mutation. That is
 * enough for the skeleton and it keeps a demo alive across restarts.
 *
 * To move to Firestore, replace the body of read()/write() and the collection
 * helpers below. No route handler reads the file directly, so nothing above
 * this layer has to change.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(here, '../../data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

let db: Db = load()

function load(): Db {
  try {
    if (fs.existsSync(DB_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as Db
      if (!Array.isArray(loaded.sellers)) loaded.sellers = []
      if (!Array.isArray(loaded.products)) loaded.products = []
      if (!Array.isArray(loaded.orders)) loaded.orders = []
      if (!Array.isArray(loaded.payments)) loaded.payments = []
      if (!Array.isArray(loaded.addresses)) loaded.addresses = []
      return loaded
    }
  } catch (err) {
    console.warn('[db] could not read db.json, reseeding:', (err as Error).message)
  }
  const fresh = seed()
  persist(fresh)
  return fresh
}

function persist(next: Db): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.error('[db] write failed:', (err as Error).message)
  }
}

/**
 * Rejected products are intentionally retained for 48 hours so the seller can
 * see the rejection and its reason. After that window they are archived,
 * which is the application's existing soft-delete and slot-release behavior.
 */
export function purgeExpiredRejectedProducts(): void {
  const now = Date.now()
  let changed = false

  for (const product of db.products) {
    if (
      product.status === 'REJECTED' &&
      product.autoDeleteAt &&
      new Date(product.autoDeleteAt).getTime() <= now
    ) {
      product.status = 'ARCHIVED'
      changed = true
    }
  }

  if (changed) persist(db)
}

export function getDb(): Db {
  // Keep expiry correct even when the process has just restarted and before
  // the background maintenance interval gets its first tick.
  purgeExpiredRejectedProducts()
  return db
}

export function save(): void {
  persist(db)
}

export function resetDb(): Db {
  db = seed()
  persist(db)
  return db
}

/** Short, sortable-ish id. Firestore will supply its own; this is a stand-in. */
export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}
