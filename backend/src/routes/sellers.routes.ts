import { Router } from 'express'
import type { DigitalProfile, Seller, SubscriptionPayment } from '@shared/types.js'
import {
  isValidFssai, isValidPhone, isValidPincode, isValidUpi, PLAN, slotInfo,
} from '@shared/seller.js'
import { makeShopSlug, makeWomenBizId, villageCode } from '@shared/womenbiz.js'
import { computeReadiness, readinessBand, recomputeForSeller } from '@shared/readiness.js'
import { getDb, newId, save } from '../db/store.js'
import { ADMIN_PAYMENT_ACCOUNT } from '../db/seed.js'
import { requireRole, signToken } from '../middleware/auth.js'

export const sellersRouter: Router = Router()

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

interface RegisterBody {
  phone: string
  name: string
  age?: number
  education?: string
  whatsapp?: string
  village: string
  taluka: string
  district: string
  pincode: string
  shopName: string
  about?: string
  businessType: Seller['businessType']
  shgName?: string
  yearsInBusiness?: number
  monthlyCapacity?: number
  sellsFood: boolean
  fssai?: string
  fssaiExpiry?: string
  upiId: string
  digital: DigitalProfile
  deliveryFee?: number
  minOrder?: number
  freeDeliveryAbove?: number
  dispatch?: Seller['dispatch']
}

/**
 * Create the seller record. She is REGISTERED at this point, not ACTIVE - she
 * still has to pay the 50 rupees and have admin approve it before she can
 * publish anything.
 *
 * Everything is validated here even though the client validates too. The client
 * validation exists to give her a fast message in Marathi; this exists because
 * the client can be bypassed.
 */
sellersRouter.post('/register', (req, res) => {
  const b = req.body as RegisterBody
  const fields: Record<string, string> = {}

  if (!isValidPhone(b.phone)) fields.phone = '10 अंकी मोबाईल नंबर टाका'
  if (!b.name?.trim()) fields.name = 'नाव आवश्यक आहे'
  if (!b.village?.trim()) fields.village = 'गाव आवश्यक आहे'
  if (!b.shopName?.trim()) fields.shopName = 'दुकानाचे नाव आवश्यक आहे'
  if (!isValidPincode(b.pincode)) fields.pincode = '6 अंकी पिनकोड टाका'
  if (!isValidUpi(b.upiId)) fields.upiId = 'UPI आयडी बरोबर नाही'
  if (b.age != null && (b.age < 18 || b.age > 90)) fields.age = 'वय 18 ते 90 दरम्यान असावे'

  // Food sellers must carry FSSAI: the platform is legally obliged to display
  // the number on every food listing and to pull expired ones.
  if (b.sellsFood) {
    if (!isValidFssai(b.fssai)) fields.fssai = 'FSSAI क्रमांक 14 अंकी असावा आणि 1 किंवा 2 ने सुरू व्हावा'
    if (!b.fssaiExpiry) fields.fssaiExpiry = 'FSSAI मुदत संपण्याची तारीख आवश्यक आहे'
  }

  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
    return
  }

  const db = getDb()
  if (db.sellers.some((s) => s.phone === b.phone)) {
    res.status(409).json({
      error: 'Already registered',
      messageMr: 'हा नंबर आधीच नोंदणीकृत आहे. लॉगिन करा.',
    })
    return
  }

  const digital: DigitalProfile = {
    smartphone: !!b.digital?.smartphone,
    internet: !!b.digital?.internet,
    upi: !!b.digital?.upi,
    whatsappBusiness: !!b.digital?.whatsappBusiness,
    socialMedia: !!b.digital?.socialMedia,
    digitalMarketing: !!b.digital?.digitalMarketing,
  }
  // Baseline score: self-reported only. The four measured factors stay at zero
  // until she actually does them, which is what makes before/after meaningful.
  const score = computeReadiness(digital)

  const womenBizId = makeWomenBizId(b.village, db.sellers.map((s) => s.womenBizId))
  const id = newId('s')

  const seller: Seller = {
    id,
    womenBizId,
    name: b.name.trim(),
    photo: '👩',
    phone: b.phone,
    whatsapp: b.whatsapp || b.phone,
    age: b.age,
    education: b.education,
    village: b.village.trim(),
    villageCode: villageCode(b.village),
    taluka: b.taluka?.trim() ?? '',
    district: b.district?.trim() ?? '',
    pincode: b.pincode.trim(),
    shopName: b.shopName.trim(),
    shopSlug: makeShopSlug(b.shopName, womenBizId),
    about: b.about?.trim(),
    businessType: b.businessType ?? 'individual',
    shgName: b.shgName?.trim(),
    yearsInBusiness: b.yearsInBusiness,
    monthlyCapacity: b.monthlyCapacity,
    sellsFood: !!b.sellsFood,
    fssai: b.sellsFood ? b.fssai : undefined,
    fssaiExpiry: b.sellsFood ? b.fssaiExpiry : undefined,
    upiId: b.upiId.trim(),
    upiVerified: false,
    digital,
    readinessScore: score,
    readinessBand: readinessBand(score),
    isOpen: true,
    deliveryFee: Number(b.deliveryFee ?? 0),
    freeDeliveryAbove: Number(b.freeDeliveryAbove ?? 0),
    minOrder: Number(b.minOrder ?? 0),
    dispatch: b.dispatch ?? 'same',
    pincodes: [b.pincode.trim()],
    status: 'REGISTERED',
    packsApproved: 0,
    rating: 0,
    ratingCount: 0,
    qrScans: 0,
    qrOrders: 0,
    createdAt: new Date().toISOString(),
  }

  db.sellers.push(seller)
  save()

  const token = signToken({ role: 'seller', userId: id, phone: b.phone, sellerId: id })
  res.status(201).json({
    seller,
    session: { token, role: 'seller', userId: id, phone: b.phone, name: seller.name, sellerId: id },
  })
})

/* ------------------------------------------------------------------ */
/* Me                                                                  */
/* ------------------------------------------------------------------ */

sellersRouter.get('/me', requireRole('seller'), (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }
  const products = db.products.filter((p) => p.sellerId === seller.id && p.status !== 'ARCHIVED')
  res.json({ seller, slots: slotInfo(seller, products) })
})

sellersRouter.patch('/me', requireRole('seller'), (req, res) => {
  const db = getDb()
  const i = db.sellers.findIndex((s) => s.id === req.auth!.sellerId)
  if (i < 0) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }

  // Allow-list. Never spread req.body into a stored record - that is how a
  // seller sets her own status to ACTIVE or grants herself slots.
  const allowed = [
    'name', 'photo', 'whatsapp', 'about', 'shopName', 'isOpen', 'deliveryFee',
    'freeDeliveryAbove', 'minOrder', 'dispatch', 'pincodes', 'monthlyCapacity',
    'age', 'education', 'yearsInBusiness', 'shgName', 'digital',
  ] as const

  const current = db.sellers[i]!
  const patch: Partial<Seller> = {}
  for (const key of allowed) {
    if (key in req.body) (patch as Record<string, unknown>)[key] = req.body[key]
  }

  // UPI changes re-enter verification: otherwise it is an account-takeover route.
  if (typeof req.body.upiId === 'string' && req.body.upiId !== current.upiId) {
    if (!isValidUpi(req.body.upiId)) {
      res.status(400).json({ error: 'Bad UPI', fields: { upiId: 'UPI आयडी बरोबर नाही' } })
      return
    }
    patch.upiId = req.body.upiId
    patch.upiVerified = false
  }

  const next = { ...current, ...patch }

  // Keep the readiness index in step with what she actually has now.
  const products = db.products.filter((p) => p.sellerId === next.id && p.status !== 'ARCHIVED')
  const completed = db.orders.filter((o) => o.sellerId === next.id && o.status === 'COMPLETED')
  const { score, band } = recomputeForSeller(next, {
    productCount: products.length,
    productsWithDetail: products.filter((p) => p.ingredients || p.material).length,
    completedOrders: completed.length,
  })
  next.readinessScore = score
  next.readinessBand = band

  db.sellers[i] = next
  save()
  res.json({ seller: next })
})

/* ------------------------------------------------------------------ */
/* Public seller pages (customer side + share QR landing)              */
/* ------------------------------------------------------------------ */

sellersRouter.get('/slug/:slug', (req, res) => {
  const seller = getDb().sellers.find((s) => s.shopSlug === req.params.slug)
  if (!seller || seller.status !== 'ACTIVE') {
    res.status(404).json({ error: 'Shop not found' })
    return
  }
  res.json({ seller: publicView(seller) })
})

sellersRouter.get('/:id', (req, res) => {
  const seller = getDb().sellers.find((s) => s.id === req.params.id)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }
  res.json({ seller: publicView(seller) })
})

/** Strip what a shopper has no business seeing. */
function publicView(s: Seller): Partial<Seller> {
  const { phone, whatsapp, age, education, digital, readinessScore, readinessBand, ...rest } = s
  void phone; void whatsapp; void age; void education
  void digital; void readinessScore; void readinessBand
  return rest
}

/* ------------------------------------------------------------------ */
/* Subscription: the 50 rupees                                         */
/* ------------------------------------------------------------------ */

sellersRouter.get('/me/subscription', requireRole('seller'), (req, res) => {
  const db = getDb()
  const sellerId = req.auth!.sellerId!
  const seller = db.sellers.find((s) => s.id === sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }
  const products = db.products.filter((p) => p.sellerId === sellerId && p.status !== 'ARCHIVED')
  res.json({
    plan: PLAN,
    account: ADMIN_PAYMENT_ACCOUNT,
    slots: slotInfo(seller, products),
    status: seller.status,
    payments: db.payments
      .filter((p) => p.sellerId === sellerId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  })
})

/** She has paid and is submitting the reference number. */
sellersRouter.post('/me/subscription/payment', requireRole('seller'), (req, res) => {
  const db = getDb()
  const sellerId = req.auth!.sellerId!
  const seller = db.sellers.find((s) => s.id === sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }

  const utr = String(req.body?.utr ?? '').replace(/\s/g, '')
  if (utr.length < 6) {
    res.status(400).json({
      error: 'UTR required',
      fields: { utr: 'पेमेंट झाल्यावर मिळणारा क्रमांक टाका' },
    })
    return
  }

  // Reusing one reference number across accounts is the obvious attack on
  // manual verification, so flag it here rather than hoping admin spots it.
  const duplicateUtr = db.payments.some((p) => p.utr === utr && p.sellerId !== sellerId)

  const payment: SubscriptionPayment = {
    id: newId('sp'),
    sellerId,
    sellerName: seller.name,
    womenBizId: seller.womenBizId,
    phone: seller.phone,
    amount: PLAN.price,
    utr,
    payerUpi: String(req.body?.payerUpi ?? seller.upiId),
    screenshotUrl: req.body?.screenshotUrl,
    submittedAt: new Date().toISOString(),
    status: 'PENDING',
    duplicateUtr,
  }

  db.payments.unshift(payment)
  seller.status = 'PAYMENT_SUBMITTED'
  save()
  res.status(201).json({ payment, status: seller.status })
})
