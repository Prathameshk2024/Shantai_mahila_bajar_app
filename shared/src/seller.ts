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


/** Indian mobile: 10 digits starting 6-9. */
export function isValidPhone(value: string | undefined): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(value))
}

/**
 * The ten digits of an Indian mobile number, and nothing else.
 *
 * The phone IS the account here - it is what login looks a seller up by - so
 * "98765 43210", "+91 9876543210" and "9876543210" have to resolve to one
 * value. They did not, which is why sellers who had already registered were
 * being sent back through registration: the stored string and the typed one
 * never matched.
 */
export function normalizePhone(value: string | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  // Strip a country code or a trunk prefix, so the stored number is always the
  // same ten digits she types at login.
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

/** Whether two spellings mean the same number. Empty never matches empty. */
export function samePhone(a: string | undefined, b: string | undefined): boolean {
  const left = normalizePhone(a)
  if (!left) return false
  return left === normalizePhone(b)
}

/**
 * A shop description composed from what she told us at registration.
 *
 * `about` is optional, and most women skip it - it is the one free-text field
 * in a long form, on a phone, in Marathi. Left empty her shop opens with a
 * name and nothing else, which reads to a customer like an abandoned listing.
 *
 * This only fills the gap; anything she writes herself replaces it.
 */
export function defaultAbout(s: {
  shopName: string
  village: string
  businessType?: 'individual' | 'shg' | 'udyam'
  shgName?: string
  sellsFood?: boolean
  yearsInBusiness?: number
}): string {
  const parts: string[] = []

  parts.push(
    s.sellsFood
      ? `${s.shopName} - ${s.village} येथून घरगुती पदार्थ.`
      : `${s.shopName} - ${s.village} येथून हस्तनिर्मित वस्तू.`,
  )

  if (s.businessType === 'shg' && s.shgName?.trim()) {
    parts.push(`${s.shgName.trim()} या बचत गटाच्या सदस्या.`)
  }

  if (s.yearsInBusiness && s.yearsInBusiness > 0) {
    parts.push(`${s.yearsInBusiness} वर्षांचा अनुभव.`)
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function isValidPincode(value: string | undefined): boolean {
  return /^[1-9]\d{5}$/.test(String(value ?? '').trim())
}

/**
 * IS THIS SOMEWHERE SHE COULD PLAUSIBLY DELIVER?
 *
 * Maharashtra pincodes start 40 through 44. Inside that, the decision is the
 * seller's: the order reaches them and they accept or rejects it, whatever
 * their listed delivery areas say - a woman in 413004 knows perfectly well
 * whether they can reach 413002, and the server guessing on their behalf
 * refused orders they wanted.
 *
 * Outside it, the order is refused before the seller ever sees it.
 *
 * 403xxx is the exception: that band is Goa, not Maharashtra, and it sits
 * inside 40-44 by an accident of postal numbering.
 */
export function isMaharashtraPincode(value: string | undefined): boolean {
  const code = String(value ?? '').trim()
  return /^4[0-4]\d{4}$/.test(code) && !code.startsWith('403')
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

/**
 * WHAT SHE MAY CHANGE ABOUT HERSELF, AND WHAT IT HAS TO LOOK LIKE.
 *
 * The allow-list on `PATCH /sellers/me` decides WHICH fields can move - her
 * status, her slots and her SMB ID are not on it and never will be. This
 * decides whether the values she sent make sense, and it runs on both sides
 * for the usual two reasons: the form can say "18 to 90" the instant she types
 * it, and the server can refuse a delivery fee of -500 typed by something that
 * is not the form.
 *
 * Returns Marathi messages keyed by field, which is the shape `{ fields }` in
 * an API error already has, so a server refusal drops straight into the same
 * red text under the same box.
 */
export function validateSellerProfile(
  p: Partial<Pick<Seller,
    | 'name' | 'shopName' | 'about' | 'whatsapp' | 'age' | 'yearsInBusiness'
    | 'monthlyCapacity' | 'deliveryFee' | 'freeDeliveryAbove' | 'minOrder'
    | 'upiId' | 'pincodes'
  >>,
): Record<string, string> {
  const f: Record<string, string> = {}
  const blank = (v: unknown) => typeof v === 'string' && !v.trim()

  // Present-but-empty is the failure. An absent key means "not editing this".
  if ('name' in p && blank(p.name)) f.name = 'नाव आवश्यक आहे'
  if ('shopName' in p && blank(p.shopName)) f.shopName = 'दुकानाचे नाव आवश्यक आहे'

  if (p.age != null && (p.age < 18 || p.age > 90)) f.age = 'वय 18 ते 90 दरम्यान असावे'
  if (p.whatsapp && !isValidPhone(p.whatsapp)) f.whatsapp = '10 अंकी मोबाईल नंबर टाका'
  if ('upiId' in p && !isValidUpi(p.upiId)) f.upiId = 'UPI आयडी बरोबर नाही'

  // Money and counts: never negative, and never a number that is not one.
  const positive: [keyof typeof p, string][] = [
    ['yearsInBusiness', 'वर्षे बरोबर लिहा'],
    ['monthlyCapacity', 'संख्या बरोबर लिहा'],
    ['deliveryFee', 'रक्कम बरोबर लिहा'],
    ['freeDeliveryAbove', 'रक्कम बरोबर लिहा'],
    ['minOrder', 'रक्कम बरोबर लिहा'],
  ]
  for (const [key, message] of positive) {
    const v = p[key]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) f[key as string] = message
  }

  // She delivers to pincodes, so a typo here is an order she never receives.
  if (p.pincodes && p.pincodes.some((code) => !isValidPincode(code))) {
    f.pincodes = '6 अंकी पिनकोड टाका'
  }

  return f
}
