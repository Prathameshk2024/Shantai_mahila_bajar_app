import { Router } from 'express'
import type { Product } from '@shared/types.js'
import { isValidFssai, slotInfo } from '@shared/seller.js'
import { getDb, newId, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'

export const productsRouter: Router = Router()

/** Permanently remove products whose admin rejection grace period has expired. */
export function purgeExpiredRejectedProducts(): number {
  const db = getDb()
  const now = Date.now()
  const before = db.products.length
  db.products = db.products.filter((p) => !(p.status === 'REJECTED' && p.rejectionExpiryAt && new Date(p.rejectionExpiryAt).getTime() <= now))
  const removed = before - db.products.length
  if (removed) save()
  return removed
}

productsRouter.get('/mine', requireRole('seller'), (req, res) => {
  purgeExpiredRejectedProducts()
  const db = getDb(); const sellerId = req.auth!.sellerId!
  const products = db.products.filter((p) => p.sellerId === sellerId && p.status !== 'ARCHIVED')
  const seller = db.sellers.find((s) => s.id === sellerId)!
  res.json({ products, slots: slotInfo(seller, products) })
})

productsRouter.post('/', requireRole('seller'), (req, res) => {
  purgeExpiredRejectedProducts()
  const db = getDb(); const sellerId = req.auth!.sellerId!; const seller = db.sellers.find((s) => s.id === sellerId)
  if (!seller) { res.status(404).json({ error: 'Seller not found' }); return }
  const b = req.body as Partial<Product> & { asDraft?: boolean }; const asDraft = !!b.asDraft
  if (!asDraft && seller.status !== 'ACTIVE') { res.status(403).json({ error: 'Not active', messageMr: 'प्रशासकाच्या मंजुरीची वाट पहा' }); return }
  const existing = db.products.filter((p) => p.sellerId === sellerId && p.status !== 'ARCHIVED')
  const slots = slotInfo(seller, existing)
  if (!asDraft && slots.isFull) { res.status(402).json({ error: 'No slots left', messageMr: 'सर्व जागा भरल्या आहेत. आणखी 5 जागांसाठी 50 रुपये भरा.', slots }); return }
  const fields: Record<string,string> = {}
  if (!b.name?.trim()) fields.name = 'उत्पादनाचे नाव आवश्यक आहे'
  if (!b.categoryId) fields.categoryId = 'प्रकार निवडा'
  if (!b.price || Number(b.price) <= 0) fields.price = 'किंमत टाका'
  if (b.isFood) { if (!isValidFssai(b.fssai)) fields.fssai = 'FSSAI क्रमांक 14 अंकी असावा आणि 1 किंवा 2 ने सुरू व्हावा'; if (!b.fssaiExpiry) fields.fssaiExpiry = 'FSSAI मुदत संपण्याची तारीख आवश्यक आहे'; if (!b.ingredients?.trim()) fields.ingredients = 'यात काय आहे ते सांगा'; if (!b.vegType) fields.vegType = 'शाकाहारी की मांसाहारी ते निवडा' }
  else if (!b.material?.trim()) fields.material = 'कोणत्या वस्तूपासून बनवले ते सांगा'
  if (!asDraft && Object.keys(fields).length) { res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields }); return }
  const product: Product = { id:newId('p'), sellerId, emoji:b.emoji ?? '📦', name:(b.name ?? '').trim(), nameEn:b.nameEn, categoryId:b.categoryId ?? '', isFood:!!b.isFood, fssai:b.isFood ? b.fssai : undefined, fssaiExpiry:b.isFood ? b.fssaiExpiry : undefined, ingredients:b.isFood ? b.ingredients : undefined, vegType:b.isFood ? b.vegType : undefined, material:b.isFood ? undefined : b.material, price:Number(b.price ?? 0), mrp:Number(b.mrp ?? 0), unit:b.unit ?? 'piece', stock:b.madeToOrder ? 0 : Number(b.stock ?? 0), madeToOrder:!!b.madeToOrder, status:asDraft ? 'DRAFT' : 'PENDING', views:0, createdAt:new Date().toISOString() }
  db.products.push(product); save(); res.status(201).json({ product })
})

productsRouter.patch('/:id', requireRole('seller'), (req, res) => {
  purgeExpiredRejectedProducts()
  const db = getDb(); const i = db.products.findIndex((p) => p.id === req.params.id && p.sellerId === req.auth!.sellerId)
  if (i < 0) { res.status(404).json({ error: 'Product not found' }); return }
  const allowed = ['name','nameEn','emoji','categoryId','price','mrp','unit','stock','madeToOrder','ingredients','vegType','material','fssai','fssaiExpiry'] as const
  const patch: Record<string,unknown> = {}; for (const key of allowed) if (key in req.body) patch[key] = req.body[key]
  if (req.body.status === 'PAUSED' || req.body.status === 'LIVE') { const current = db.products[i]!.status; if (current === 'LIVE' || current === 'PAUSED') patch.status = req.body.status }
  db.products[i] = { ...db.products[i]!, ...patch } as Product; save(); res.json({ product:db.products[i] })
})

productsRouter.delete('/:id', requireRole('seller'), (req, res) => {
  purgeExpiredRejectedProducts()
  const db = getDb(); const i = db.products.findIndex((p) => p.id === req.params.id && p.sellerId === req.auth!.sellerId)
  if (i < 0) { res.status(404).json({ error: 'Product not found' }); return }
  db.products[i]!.status = 'ARCHIVED'; db.products[i]!.rejectedAt = undefined; db.products[i]!.rejectionExpiryAt = undefined; save()
  const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)!; const remaining = db.products.filter((p) => p.sellerId === seller.id && p.status !== 'ARCHIVED')
  res.json({ ok:true, slots:slotInfo(seller, remaining) })
})
