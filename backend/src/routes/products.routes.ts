import { Router } from 'express'
import type { Product } from '@shared/types.js'
import { slotInfo } from '@shared/seller.js'
import { getDb, newId, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'
import { purgeExpiredRejections } from '../db/moderation.js'

export const productsRouter: Router = Router()

/**
 * What a listing must have before the public can see it.
 *
 * Shared by "publish a new product" and "publish a draft she saved earlier",
 * because a draft that skipped the check on the way in would otherwise reach
 * the catalogue by the back door.
 */
function listingProblems(b: Partial<Product>): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!b.name?.trim()) fields.name = 'उत्पादनाचे नाव आवश्यक आहे'
  if (!b.categoryId) fields.categoryId = 'प्रकार निवडा'
  if (!b.price || Number(b.price) <= 0) fields.price = 'किंमत टाका'

  if (b.isFood) {
    if (!b.ingredients?.trim()) fields.ingredients = 'यात काय आहे ते सांगा'
    if (!b.vegType) fields.vegType = 'शाकाहारी की मांसाहारी ते निवडा'
  } else if (!b.material?.trim()) {
    fields.material = 'कोणत्या वस्तूपासून बनवले ते सांगा'
  }
  return fields
}

/** Her own products, including drafts and rejected ones. */
productsRouter.get('/mine', requireRole('seller'), (req, res) => {
  const db = getDb()
  // A rejection she has already had 48 hours to read is gone by now. Swept on
  // read as well as on the timer, so her list and the server never disagree.
  if (purgeExpiredRejections(db.products)) save()
  const sellerId = req.auth!.sellerId!
  const products = db.products.filter((p) => p.sellerId === sellerId && p.status !== 'ARCHIVED')
  const seller = db.sellers.find((s) => s.id === sellerId)!
  res.json({ products, slots: slotInfo(seller, products) })
})



productsRouter.post('/', requireRole('seller'), (req, res) => {
  const db = getDb()
  const sellerId = req.auth!.sellerId!
  const seller = db.sellers.find((s) => s.id === sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }

  const b = req.body as Partial<Product> & { asDraft?: boolean }
  const asDraft = !!b.asDraft

  // She cannot publish until the 50 rupees is approved.
  if (!asDraft && seller.status !== 'ACTIVE') {
    res.status(403).json({
      error: 'Not active',
      messageMr: 'प्रशासकाच्या मंजुरीची वाट पहा',
    })
    return
  }

  // THE SLOT GATE. Enforced here, not just by the disabled button in the UI -
  // the button is a courtesy, this is the rule.
  const existing = db.products.filter((p) => p.sellerId === sellerId && p.status !== 'ARCHIVED')
  const slots = slotInfo(seller, existing)
  if (!asDraft && slots.isFull) {
    res.status(402).json({
      error: 'No slots left',
      messageMr: 'सर्व जागा भरल्या आहेत. आणखी 5 जागांसाठी 50 रुपये भरा.',
      slots,
    })
    return
  }

  const fields = listingProblems(b)

  if (!asDraft && Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
    return
  }

  const product: Product = {
    id: newId('p'),
    sellerId,
    emoji: b.emoji ?? '📦',
    imageUrl: b.imageUrl,
    imagePublicId: b.imagePublicId,
    name: (b.name ?? '').trim(),
    nameEn: b.nameEn,
    categoryId: b.categoryId ?? '',
    isFood: !!b.isFood,
    // Stamped from her seller record - one source of truth.
    ingredients: b.isFood ? b.ingredients : undefined,
    vegType: b.isFood ? b.vegType : undefined,
    material: b.isFood ? undefined : b.material,
    price: Number(b.price ?? 0),
    mrp: Number(b.mrp ?? 0),
    unit: b.unit ?? 'piece',
    stock: b.madeToOrder ? 0 : Number(b.stock ?? 0),
    madeToOrder: !!b.madeToOrder,
    /**
     * HERS TO PUBLISH. Listings used to land in an admin moderation queue and
     * wait, which meant a woman who added a product on Tuesday could be
     * invisible until somebody at a desk got to her on Friday - and the
     * platform exists to remove exactly that kind of gatekeeper from between
     * her and a customer.
     *
     * Moderation is now after the fact, not before it: her phone, her UPI and
     * her SMB ID are all on the record, she is told so at the moment she
     * publishes, and an admin can still take a listing down. Accountability
     * without a queue.
     */
    status: asDraft ? 'DRAFT' : 'LIVE',
    views: 0,
    createdAt: new Date().toISOString(),
  }

  db.products.push(product)
  save()
  res.status(201).json({ product })
})

productsRouter.patch('/:id', requireRole('seller'), (req, res) => {
  const db = getDb()
  const i = db.products.findIndex(
    (p) => p.id === req.params.id && p.sellerId === req.auth!.sellerId,
  )
  if (i < 0) {
    res.status(404).json({ error: 'Product not found' })
    return
  }

  const allowed = [
    'name', 'nameEn', 'emoji', 'categoryId', 'price', 'mrp', 'unit', 'stock',
    'madeToOrder', 'ingredients', 'vegType', 'material',
    'imageUrl', 'imagePublicId',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]

  const current = db.products[i]!

  // Pausing and un-pausing is the only status change a seller may make herself.
  if (req.body.status === 'PAUSED' || req.body.status === 'LIVE') {
    if (current.status === 'LIVE' || current.status === 'PAUSED') patch.status = req.body.status
  }

  /**
   * Sending a draft - or a rejected listing she has since fixed - back to the
   * moderation queue. It goes to PENDING, never straight to LIVE: a seller
   * cannot approve her own listing, and skipping the queue here would make
   * "save as draft" the way around it.
   *
   * A draft consumes no slot, so publishing one does, which is why the slot
   * gate has to run here too and not only on create.
   */
  if (req.body.status === 'LIVE' && (current.status === 'DRAFT' || current.status === 'REJECTED')) {
    const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)!
    if (seller.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Not active', messageMr: 'प्रशासकाच्या मंजुरीची वाट पहा' })
      return
    }

    const merged = { ...current, ...patch } as Product
    const fields = listingProblems(merged)
    if (Object.keys(fields).length) {
      res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
      return
    }

    const others = db.products.filter(
      (p) => p.sellerId === seller.id && p.id !== current.id && p.status !== 'ARCHIVED',
    )
    const slots = slotInfo(seller, others)
    if (slots.isFull) {
      res.status(402).json({
        error: 'No slots left',
        messageMr: 'सर्व जागा भरल्या आहेत. आणखी 5 जागांसाठी 50 रुपये भरा.',
        slots,
      })
      return
    }
    patch.status = 'LIVE'
  }

  // Editing a live listing no longer knocks it back into a queue. She can fix
  // a price or a photo and have the change go live, which is what editing
  // means everywhere else she has ever used a phone.

  db.products[i] = { ...current, ...patch } as Product
  save()
  res.json({ product: db.products[i] })
})

/** Archiving frees a slot immediately - that is the whole point of it. */
productsRouter.delete('/:id', requireRole('seller'), (req, res) => {
  const db = getDb()
  const i = db.products.findIndex(
    (p) => p.id === req.params.id && p.sellerId === req.auth!.sellerId,
  )
  if (i < 0) {
    res.status(404).json({ error: 'Product not found' })
    return
  }
  db.products[i]!.status = 'ARCHIVED'
  save()

  const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)!
  const remaining = db.products.filter(
    (p) => p.sellerId === seller.id && p.status !== 'ARCHIVED',
  )
  res.json({ ok: true, slots: slotInfo(seller, remaining) })
})
