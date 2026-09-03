import { Router } from 'express'
import { getDb } from '../db/store.js'
import { CATEGORIES } from '../db/seed.js'

/** Public, unauthenticated. This is what a shopper and a scanned QR both hit. */
export const catalogRouter: Router = Router()

catalogRouter.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORIES })
})

catalogRouter.get('/products', (req, res) => {
  const db = getDb()
  const { categoryId, q, pincode } = req.query as Record<string, string | undefined>

  const openSellers = new Set(
    db.sellers.filter((s) => s.isOpen && s.status === 'ACTIVE').map((s) => s.id),
  )

  let list = db.products.filter((p) => p.status === 'LIVE' && openSellers.has(p.sellerId))

  if (categoryId) list = list.filter((p) => p.categoryId === categoryId)

  if (pincode) {
    const serviceable = new Set(
      db.sellers.filter((s) => s.pincodes.includes(pincode)).map((s) => s.id),
    )
    list = list.filter((p) => serviceable.has(p.sellerId))
  }

  if (q?.trim()) {
    const needle = q.trim().toLowerCase()
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.nameEn ?? '').toLowerCase().includes(needle),
    )
  }

  // Attach the seller card each listing needs, plus the FSSAI number, which
  // the law requires to be displayed on every food listing.
  const withSeller = list.map((p) => {
    const s = db.sellers.find((x) => x.id === p.sellerId)
    return {
      ...p,
      seller: s && {
        id: s.id,
        womenBizId: s.womenBizId,
        name: s.name,
        photo: s.photo,
        shopName: s.shopName,
        shopSlug: s.shopSlug,
        village: s.village,
        rating: s.rating,
        ratingCount: s.ratingCount,
        deliveryFee: s.deliveryFee,
        freeDeliveryAbove: s.freeDeliveryAbove,
        fssai: s.fssai,
      },
    }
  })

  res.json({ products: withSeller })
})

catalogRouter.get('/products/:id', (req, res) => {
  const db = getDb()
  const product = db.products.find((p) => p.id === req.params.id)
  if (!product) {
    res.status(404).json({ error: 'Product not found' })
    return
  }
  const seller = db.sellers.find((s) => s.id === product.sellerId)
  res.json({ product, seller })
})

catalogRouter.get('/addresses', (_req, res) => {
  res.json({ addresses: getDb().addresses })
})

/**
 * Share-QR landing. Records the scan, then the client redirects to the shop.
 * In production this endpoint also stamps the Play Store referrer so the
 * Install Referrer API can route a fresh install to her shop.
 */
catalogRouter.post('/share/:slug/scan', (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.shopSlug === req.params.slug)
  if (!seller) {
    res.status(404).json({ error: 'Shop not found' })
    return
  }
  seller.qrScans += 1
  res.json({ ok: true, shopSlug: seller.shopSlug })
})
