import { Router } from 'express'
import type { Feedback } from '@shared/types.js'
import { getDb, newId, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'

interface FeedbackDb {
  feedback: Feedback[]
}

export const feedbackRouter: Router = Router()

feedbackRouter.post('/', requireRole('customer'), (req, res) => {
  const db = getDb() as typeof getDb extends () => infer T ? T & FeedbackDb : never
  const orderId = String(req.body?.orderId ?? '')
  const rating = Number(req.body?.rating)
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : ''

  if (!orderId) {
    res.status(400).json({ error: 'Order required', messageMr: 'ऑर्डर निवडा' })
    return
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Invalid rating', messageMr: '1 ते 5 मधील रेटिंग द्या' })
    return
  }
  if (comment.length > 500) {
    res.status(400).json({ error: 'Comment too long', messageMr: 'अभिप्राय 500 अक्षरांपेक्षा कमी असावा' })
    return
  }

  const order = db.orders.find((o) => o.id === orderId && o.customerId === req.auth!.customerId)
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  if (order.status !== 'COMPLETED') {
    res.status(409).json({ error: 'Order not completed', messageMr: 'ऑर्डर पूर्ण झाल्यावर अभिप्राय देता येईल' })
    return
  }

  const existing = db.feedback.find((f) => f.orderId === order.id && f.customerId === req.auth!.customerId)
  if (existing) {
    res.status(409).json({ error: 'Feedback already submitted', messageMr: 'या ऑर्डरसाठी अभिप्राय आधीच दिला आहे' })
    return
  }

  const feedback: Feedback = {
    id: newId('fb'),
    orderId: order.id,
    sellerId: order.sellerId,
    customerId: req.auth!.customerId!,
    rating,
    comment: comment || undefined,
    createdAt: new Date().toISOString(),
  }

  db.feedback.unshift(feedback)

  const seller = db.sellers.find((s) => s.id === order.sellerId)
  if (seller) {
    const sellerFeedback = db.feedback.filter((f) => f.sellerId === seller.id)
    seller.ratingCount = sellerFeedback.length
    seller.rating = sellerFeedback.length
      ? Math.round((sellerFeedback.reduce((sum, f) => sum + f.rating, 0) / sellerFeedback.length) * 10) / 10
      : 0
  }

  save()
  res.status(201).json({ feedback })
})

feedbackRouter.get('/mine', requireRole('customer'), (req, res) => {
  const db = getDb() as typeof getDb extends () => infer T ? T & FeedbackDb : never
  res.json({ feedback: db.feedback.filter((f) => f.customerId === req.auth!.customerId) })
})

feedbackRouter.get('/admin', requireRole('admin'), (_req, res) => {
  const db = getDb() as typeof getDb extends () => infer T ? T & FeedbackDb : never
  res.json({
    feedback: db.feedback
      .map((f) => ({
        ...f,
        customer: db.orders.find((o) => o.id === f.orderId)?.customerName,
        seller: db.sellers.find((s) => s.id === f.sellerId)?.shopName,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })
})
