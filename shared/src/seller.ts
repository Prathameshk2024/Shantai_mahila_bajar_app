import type { Product, ProductStatus, Seller } from './types.js'

/**
 * SUBSCRIPTION + PRODUCT SLOTS
 * 50 rupees buys one PACK = 5 product slots. A 6th product means a second pack.
 * No gateway: she pays the admin's account and admin approves by hand.
 */

export const PLAN = {
  price: 50,
  slotsPerPack: 5,
  /** null = lifetime. A field, not a constant, so switching to yearly is config. */
  validityDays: null as number | null,
}

/**
 * Which product states consume a slot.
 *
 * DRAFT deliberately does not, so she can experiment before paying. ARCHIVED
 * does not either, so archiving frees a slot immediately - without that escape
 * hatch a woman with five bad listings is stuck forever and her only option is
 * paying again, which is how you lose her.
 */
export const SLOT_CONSUMING: ProductStatus[] = ['PENDING', 'LIVE', 'PAUSED', 'REJECTED']

export function countUsedSlots(products: Pick<Product, 'status'>[]): number {
  return products.filter((p) => SLOT_CONSUMING.includes(p.status)).length
}

export interface SlotInfo {
  total: number
  used: number
  left: number
  isFull: boolean
  almostFull: boolean
}

export function slotInfo(
  seller: Pick<Seller, 'packsApproved'>,
  products: Pick<Product, 'status'>[],
): SlotInfo {
  const total = (seller.packsApproved || 0) * PLAN.slotsPerPack
  const used = countUsedSlots(products)
  return {
    total,
    used,
    left: Math.max(0, total - used),
    isFull: total > 0 && used >= total,
    almostFull: total > 0 && total - used === 1,
  }
}

export const PRODUCT_STATUS_STYLE: Record<
  Exclude<ProductStatus, 'ARCHIVED'>,
  { tone: 'neutral' | 'info' | 'warn' | 'ok' | 'danger'; icon: string; labelKey: string }
> = {
  LIVE: { tone: 'ok', icon: '●', labelKey: 'prod.live' },
  DRAFT: { tone: 'neutral', icon: '✎', labelKey: 'prod.draft' },
  PENDING: { tone: 'warn', icon: '⏳', labelKey: 'prod.pending' },
  REJECTED: { tone: 'danger', icon: '✖', labelKey: 'prod.rejected' },
  PAUSED: { tone: 'neutral', icon: '⏸', labelKey: 'prod.paused' },
}

/* ------------------------------------------------------------------ */
/* Validation - used by BOTH sides. The client validates for a fast,   */
/* friendly message; the server validates because the client can lie.  */
/* ------------------------------------------------------------------ */

/** FSSAI: 14 digits, first digit 1 (Central) or 2 (State/Basic). */
export function isValidFssai(value: string | undefined): boolean {
  return /^[12]\d{13}$/.test(String(value ?? '').replace(/\s/g, ''))
}

/** Indian mobile: 10 digits starting 6-9. */
export function isValidPhone(value: string | undefined): boolean {
  return /^[6-9]\d{9}$/.test(String(value ?? '').replace(/\D/g, ''))
}

export function isValidPincode(value: string | undefined): boolean {
  return /^[1-9]\d{5}$/.test(String(value ?? '').trim())
}

/** UPI virtual payment address, e.g. sunita@ybl */
export function isValidUpi(value: string | undefined): boolean {
  return /^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/.test(String(value ?? '').trim())
}

/**
 * Build the UPI intent link for an order.
 *
 * Generated from her stored UPI ID rather than the QR image she uploaded,
 * because a generated link carries the exact amount. An uploaded screenshot has
 * no amount in it, so the customer types it by hand and can get it wrong.
 */
export function buildUpiLink(opts: {
  upiId: string
  name?: string
  amount: number
  note?: string
  ref?: string
}): string {
  const p = new URLSearchParams({
    pa: opts.upiId,
    pn: opts.name ?? '',
    am: Number(opts.amount).toFixed(2),
    cu: 'INR',
  })
  if (opts.note) p.set('tn', opts.note)
  if (opts.ref) p.set('tr', opts.ref)
  return `upi://pay?${p.toString()}`
}

/** Education options - kept short, and phrased the way a survey would ask. */
export const EDUCATION_LEVELS: { value: string; mr: string; en: string }[] = [
  { value: 'none', mr: 'शिक्षण नाही', en: 'No formal schooling' },
  { value: 'primary', mr: '4 थी पर्यंत', en: 'Up to 4th' },
  { value: 'middle', mr: '7 वी पर्यंत', en: 'Up to 7th' },
  { value: 'secondary', mr: '10 वी', en: '10th' },
  { value: 'higher', mr: '12 वी', en: '12th' },
  { value: 'graduate', mr: 'पदवी', en: 'Graduate' },
]
