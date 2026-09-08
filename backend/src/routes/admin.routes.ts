import { Router } from 'express'
import type { AdminStats, ReadinessBand } from '@shared/types.js'
import { PLAN, slotInfo } from '@shared/seller.js'
import { BAND_LABEL } from '@shared/readiness.js'
import { getDb, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'

export const adminRouter: Router = Router()
adminRouter.use(requireRole('admin'))

adminRouter.get('/stats', (_req, res) => {
  const db = getDb()
  const today = new Date().toDateString()
  const monthAgo = Date.now() - 30 * 86_400_000
  const delivered = db.orders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED')
  const deliveredAt = (o: (typeof delivered)[number]) => o.events.find((e) => e.to === 'DELIVERED')?.at
  const earnedTotal = delivered.reduce((n, o) => n + o.total, 0)
  const earnedMonth = delivered.filter((o) => { const at = deliveredAt(o); return at ? new Date(at).getTime() >= monthAgo : false }).reduce((n, o) => n + o.total, 0)
  const sellersWithEarnings = new Set(delivered.map((o) => o.sellerId))
  const stuck = db.orders.filter((o) => {
    const last = o.events[o.events.length - 1]; if (!last) return false
    const ageH = (Date.now() - new Date(last.at).getTime()) / 3_600_000
    if (o.status === 'ACCEPTED' || o.status === 'PACKED') return ageH > 24
    if (o.status === 'OUT_FOR_DELIVERY') return ageH > 12
    return false
  })
  const bands: Record<ReadinessBand, number> = { starter: 0, basic: 0, advanced: 0, digital: 0 }
  for (const s of db.sellers) bands[s.readinessBand] += 1
  const bandOf = (v: number) => v === 0 ? '₹0' : v < 1000 ? '< ₹1,000' : v <= 5000 ? '₹1,000-5,000' : '> ₹5,000'
  const perSeller = new Map<string, number>(); for (const s of db.sellers) perSeller.set(s.id, 0)
  for (const o of delivered) perSeller.set(o.sellerId, (perSeller.get(o.sellerId) ?? 0) + o.total)
  const earningBandCounts = new Map<string, number>()
  for (const v of perSeller.values()) { const label = bandOf(v); earningBandCounts.set(label, (earningBandCounts.get(label) ?? 0) + 1) }
  const approvedPayments = db.payments.filter((p) => p.status === 'APPROVED')
  const packsBySeller = new Map<string, number>()
  for (const p of approvedPayments) packsBySeller.set(p.sellerId, (packsBySeller.get(p.sellerId) ?? 0) + 1)
  const repurchasers = [...packsBySeller.values()].filter((n) => n > 1).length
  const stats: AdminStats = {
    gmvMonth: earnedMonth,
    ordersToday: db.orders.filter((o) => new Date(o.placedAt).toDateString() === today).length,
    ordersWeek: db.orders.filter((o) => Date.now() - new Date(o.placedAt).getTime() < 7 * 86_400_000).length,
    activeSellers: db.sellers.filter((s) => s.status === 'ACTIVE').length,
    totalSellers: db.sellers.length,
    newRegistrations: db.sellers.filter((s) => Date.now() - new Date(s.createdAt).getTime() < 7 * 86_400_000).length,
    pendingPayments: db.payments.filter((p) => p.status === 'PENDING').length,
    pendingProducts: db.products.filter((p) => p.status === 'PENDING').length,
    stuckOrders: stuck.length,
    openDisputes: 0,
    womenEarnedTotal: earnedTotal,
    womenEarnedMonth: earnedMonth,
    womenWithFirstEarning: sellersWithEarnings.size,
    subscriptionRevenue: approvedPayments.reduce((n, p) => n + p.amount, 0),
    repurchaseRate: db.sellers.length ? repurchasers / db.sellers.length : 0,
    funnel: [
      { mr: 'नोंदणी केली', en: 'Registered', v: db.sellers.length },
      { mr: '50 रुपये भरले', en: 'Paid ₹50', v: db.payments.length },
      { mr: 'मंजूर झाले', en: 'Approved', v: db.sellers.filter((s) => s.status === 'ACTIVE').length },
      { mr: 'पहिले उत्पादन', en: 'First product', v: new Set(db.products.map((p) => p.sellerId)).size },
      { mr: 'पहिली ऑर्डर', en: 'First order', v: sellersWithEarnings.size },
    ],
    earningBands: ['₹0', '< ₹1,000', '₹1,000-5,000', '> ₹5,000'].map((label) => ({ label, v: earningBandCounts.get(label) ?? 0 })),
    readinessBands: (Object.keys(bands) as ReadinessBand[]).map((band) => ({ band, v: bands[band] })),
  }
  res.json({ stats, bandLabels: BAND_LABEL })
})

adminRouter.get('/payments', (req, res) => {
  const db = getDb(); const status = (req.query.status as string) ?? 'PENDING'
  const list = db.payments.filter((p) => status === 'ALL' ? true : p.status === status).map((p) => ({ ...p, waitingHours: Math.round((Date.now() - new Date(p.submittedAt).getTime()) / 3_600_000) }))
  const approvedTotal = db.payments.filter((p) => p.status === 'APPROVED').reduce((n, p) => n + p.amount, 0)
  res.json({ payments: list, approvedTotal })
})

adminRouter.post('/payments/:id/approve', (req, res) => {
  const db = getDb(); const payment = db.payments.find((p) => p.id === req.params.id)
  if (!payment) { res.status(404).json({ error: 'Payment not found' }); return }
  if (payment.status !== 'PENDING') { res.status(409).json({ error: `Already ${payment.status}` }); return }
  payment.status = 'APPROVED'; payment.verifiedAt = new Date().toISOString(); payment.verifiedBy = req.auth!.userId
  const seller = db.sellers.find((s) => s.id === payment.sellerId)
  if (seller) { seller.packsApproved += 1; seller.status = 'ACTIVE' }
  save(); res.json({ payment, seller })
})

adminRouter.post('/payments/:id/reject', (req, res) => {
  const db = getDb(); const payment = db.payments.find((p) => p.id === req.params.id)
  if (!payment) { res.status(404).json({ error: 'Payment not found' }); return }
  if (payment.status !== 'PENDING') { res.status(409).json({ error: `Already ${payment.status}` }); return }
  payment.status = 'REJECTED'; payment.rejectReason = String(req.body?.reason ?? 'UTR did not match the bank statement'); payment.verifiedAt = new Date().toISOString(); payment.verifiedBy = req.auth!.userId
  const seller = db.sellers.find((s) => s.id === payment.sellerId); if (seller) seller.status = 'PAYMENT_REJECTED'
  save(); res.json({ payment })
})

adminRouter.post('/sellers/:id/grant-slots', (req, res) => {
  const db = getDb(); const seller = db.sellers.find((s) => s.id === req.params.id)
  if (!seller) { res.status(404).json({ error: 'Seller not found' }); return }
  seller.packsApproved += Math.max(1, Number(req.body?.packs ?? 1))
  if (seller.status === 'REGISTERED' || seller.status === 'PAYMENT_SUBMITTED') seller.status = 'ACTIVE'
  save(); res.json({ seller })
})

adminRouter.get('/products', (req, res) => {
  const db = getDb(); const status = (req.query.status as string) ?? 'PENDING'
  const list = db.products.filter((p) => status === 'ALL' ? true : p.status === status).map((p) => ({ ...p, seller: db.sellers.find((s) => s.id === p.sellerId) }))
  res.json({ products: list })
})

/** Admin moderation is rejection, not deletion. Rejected products remain visible to the seller for 48h, then are purged automatically. */
adminRouter.post('/products/:id/moderate', (req, res) => {
  const db = getDb(); const product = db.products.find((p) => p.id === req.params.id)
  if (!product) { res.status(404).json({ error: 'Product not found' }); return }
  const approve = !!req.body?.approve
  if (approve && product.isFood && !product.fssai) { res.status(409).json({ error: 'Food listing has no FSSAI number', messageMr: 'FSSAI क्रमांकाशिवाय खाद्यपदार्थ प्रकाशित करता येणार नाही' }); return }
  if (!approve) {
    const now = new Date()
    product.status = 'REJECTED'
    product.rejectReason = String(req.body?.reason ?? 'Product rejected by admin')
    product.rejectedAt = now.toISOString()
    product.rejectionExpiryAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  } else {
    product.status = 'LIVE'
    product.rejectReason = undefined
    product.rejectedAt = undefined
    product.rejectionExpiryAt = undefined
  }
  save(); res.json({ product })
})

adminRouter.get('/orders', (req, res) => {
  const db = getDb(); const { status, sellerId, pincode } = req.query as Record<string, string | undefined>
  let list = [...db.orders]; if (status) list = list.filter((o) => o.status === status); if (sellerId) list = list.filter((o) => o.sellerId === sellerId); if (pincode) list = list.filter((o) => o.pincode === pincode)
  res.json({ orders: list.sort((a, b) => b.placedAt.localeCompare(a.placedAt)).map((o) => ({ ...o, seller: db.sellers.find((s) => s.id === o.sellerId)?.shopName, womenBizId: db.sellers.find((s) => s.id === o.sellerId)?.womenBizId })) })
})

adminRouter.get('/sellers', (_req, res) => {
  const db = getDb(); res.json({ sellers: db.sellers.map((s) => { const products = db.products.filter((p) => p.sellerId === s.id && p.status !== 'ARCHIVED'); return { ...s, slots: slotInfo(s, products), productCount: products.length } }) })
})

adminRouter.post('/sellers/:id/block', (req, res) => {
  const db = getDb(); const seller = db.sellers.find((s) => s.id === req.params.id)
  if (!seller) { res.status(404).json({ error: 'Seller not found' }); return }
  seller.status = req.body?.blocked ? 'BLOCKED' : 'ACTIVE'; save(); res.json({ seller })
})

adminRouter.get('/impact', (_req, res) => {
  const db = getDb(); const delivered = db.orders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED')
  const byVillage = new Map<string, { village:string; women:number; earned:number }>()
  for (const s of db.sellers) { const row = byVillage.get(s.villageCode) ?? { village:s.village, women:0, earned:0 }; row.women += 1; byVillage.set(s.villageCode, row) }
  for (const o of delivered) { const s = db.sellers.find((x) => x.id === o.sellerId); if (!s) continue; const row = byVillage.get(s.villageCode); if (row) row.earned += o.total }
  res.json({ generatedAt:new Date().toISOString(), totals:{ women:db.sellers.length, activeWomen:db.sellers.filter((s)=>s.status==='ACTIVE').length, womenWithEarnings:new Set(delivered.map((o)=>o.sellerId)).size, earned:delivered.reduce((n,o)=>n+o.total,0), orders:delivered.length, villages:byVillage.size }, byVillage:[...byVillage.entries()].map(([code,row])=>({code,...row})), readiness:db.sellers.map((s)=>({womenBizId:s.womenBizId,village:s.village,score:s.readinessScore,band:s.readinessBand})) })
})
