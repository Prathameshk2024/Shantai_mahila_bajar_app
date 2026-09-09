import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEEN_KEY, TOURS, TOUR_MENU, markTourSeen, seenTours } from '../src/lib/tours.js'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * A walkthrough shows itself the first time she opens a screen and then gets
 * out of the way. The flag is what makes that true, so these are about the
 * flag: it survives, it is written once, and a corrupt row teaches her the
 * app again rather than crashing every screen she opens.
 */

function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: () => m.get(SEEN_KEY),
  }
}

test('a finished tour is remembered, and never written twice', () => {
  const store = fakeStore()
  assert.deepEqual(seenTours(store), [])

  markTourSeen(store, 'seller.business')
  markTourSeen(store, 'seller.business')
  markTourSeen(store, 'shop.cart')

  assert.deepEqual(seenTours(store), ['seller.business', 'shop.cart'])
})

/** A hand-edited row must not lock her out of every screen in the app. */
test('an unreadable flag means nothing has been seen, not a crash', () => {
  const store = fakeStore()
  store.setItem(SEEN_KEY, '{oops')
  assert.deepEqual(seenTours(store), [])

  store.setItem(SEEN_KEY, '"seller.help"')
  assert.deepEqual(seenTours(store), [])
})

/**
 * The Help & Training list is the only way back into a walkthrough she has
 * already dismissed, so every tab it offers has to lead somewhere real.
 */
test('every tour offered in Help & Training exists', () => {
  for (const role of ['seller', 'customer'] as const) {
    assert.equal(TOUR_MENU[role].length, 4, `${role} has four bottom tabs`)
    for (const { id, label } of TOUR_MENU[role]) {
      assert.ok(TOURS[id]?.length, `${id} has no steps`)
      assert.ok(label in dictionaries.mr, `${label} is not in the dictionary`)
    }
  }
})

/** A missing key renders as its own name, in the middle of a lesson. */
test('every walkthrough step reads from both dictionaries', () => {
  const missing: string[] = []
  for (const [id, steps] of Object.entries(TOURS)) {
    for (const s of steps) {
      for (const key of [s.title, s.body]) {
        if (!(key in dictionaries.mr) || !(key in dictionaries.en)) missing.push(`${id}: ${key}`)
      }
    }
  }
  assert.deepEqual(missing, [])
})

/**
 * The point of the whole feature: the ring goes around a control that is
 * really on the screen. A selector that names nothing in the source is a step
 * pointing at a control we deleted.
 */
test('every step targets a control the app actually renders', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')

  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.tsx')) files.push(p)
    }
  }
  walk(join(import.meta.dirname, '..', 'src'))
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n')

  const orphans: string[] = []
  for (const [id, steps] of Object.entries(TOURS)) {
    for (const { sel } of steps) {
      if (!sel) continue
      const attr = sel.match(/^\[data-wt="([^"]+)"\]$/)
      const found = attr ? src.includes(`data-wt="${attr[1]}"`) : src.includes(sel.slice(1))
      if (!found) orphans.push(`${id}: ${sel}`)
    }
  }
  assert.deepEqual(orphans, [], 'these steps ring nothing')
})
