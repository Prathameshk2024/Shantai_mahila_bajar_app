import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminNotice, Seller } from '@shared/types.js'
import { adminFeed, mergeFeeds, noticeLabelKey } from '../src/lib/notifications.js'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * The updates list is read by a woman waiting at home, not by the state
 * machine. It used to print the machine's own label - "Packed", "Accepted" -
 * which says what the ORDER is, and leaves her to work out who did what to it.
 * Each side now gets a sentence aimed at itself.
 */

test('the customer is told what happened to HER order', () => {
  assert.equal(
    dictionaries.en[noticeLabelKey('ACCEPTED', 'customer')],
    'Your order has been accepted',
  )
  assert.equal(
    dictionaries.en[noticeLabelKey('DELIVERED', 'customer')],
    'Your order has been delivered',
  )
})

/** The same event, the other way round: for the seller it is work to do. */
test('the seller is told there is something to do', () => {
  assert.equal(dictionaries.en[noticeLabelKey('PLACED', 'seller')], 'You have a new order')
  assert.notEqual(
    noticeLabelKey('CANCELLED', 'seller'),
    noticeLabelKey('CANCELLED', 'customer'),
  )
})

/** A state nobody wrote a sentence for still reads as words, not as a key. */
test('an unmapped state falls back to the plain status label', () => {
  const key = noticeLabelKey('PACKED', 'seller')
  assert.equal(key, 'ord.status.PACKED')
  assert.ok(dictionaries.mr[key], 'the fallback has to exist in both dictionaries')
  assert.ok(dictionaries.en[key])
})

test('every line the feed can print exists in both languages', () => {
  const states = [
    'PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED',
  ] as const
  const missing: string[] = []
  for (const role of ['seller', 'customer'] as const) {
    for (const s of states) {
      const key = noticeLabelKey(s, role)
      if (!dictionaries.mr[key] || !dictionaries.en[key]) missing.push(`${role}/${s}: ${key}`)
    }
  }
  assert.deepEqual(missing, [])
})

/* ------------------------------------------------------------------ */
/* Admin decisions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Her slots used to just grow. An admin approved the ₹50, five slots
 * appeared, and nothing anywhere told her - she had to spot the meter. These
 * lines come off her own seller record, written by the admin handler.
 */
function seller(notices: AdminNotice[]): Seller {
  return { id: 's1', notices } as Seller
}

test('a granted pack is a sentence with the number in it', () => {
  const [row] = adminFeed(seller([
    { id: 'a1', at: '2026-09-08T10:00:00.000Z', kind: 'SLOTS_GRANTED', n: 5 },
  ]))

  assert.equal(row?.labelKey, 'notif.adm.SLOTS_GRANTED')
  assert.deepEqual(row?.vars, { n: 5 })
  assert.equal(
    dictionaries.en[row!.labelKey]?.replace('{n}', '5'),
    'You have been given 5 more product slots',
  )
})

/** No order behind it, so nothing may render an order id or a rupee amount. */
test('an admin line carries no order and no money', () => {
  const [row] = adminFeed(seller([
    { id: 'a2', at: '2026-09-08T10:00:00.000Z', kind: 'UNBLOCKED' },
  ]))

  assert.equal(row?.orderId, undefined)
  assert.equal(row?.total, undefined)
})

test('a rejection carries its reason across', () => {
  const [row] = adminFeed(seller([
    { id: 'a3', at: '2026-09-08T10:00:00.000Z', kind: 'PRODUCT_REJECTED', note: 'Photo unclear' },
  ]))

  assert.equal(row?.who, 'Photo unclear')
})

test('both halves of the list are one list, newest first', () => {
  const merged = mergeFeeds(
    [{ id: 'o1', at: '2026-09-01T00:00:00.000Z', labelKey: 'x', who: '' }],
    adminFeed(seller([
      { id: 'a4', at: '2026-09-08T00:00:00.000Z', kind: 'SLOTS_GRANTED', n: 5 },
    ])),
  )

  assert.deepEqual(merged.map((n) => n.id), ['a4', 'o1'])
})

test('every admin line exists in both languages', () => {
  const kinds: AdminNotice['kind'][] = [
    'SLOTS_GRANTED', 'SLOTS_REVOKED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED',
    'BLOCKED', 'UNBLOCKED', 'PRODUCT_APPROVED', 'PRODUCT_REJECTED',
  ]
  const missing = kinds
    .map((k) => `notif.adm.${k}`)
    .filter((key) => !dictionaries.mr[key] || !dictionaries.en[key])

  assert.deepEqual(missing, [])
})
