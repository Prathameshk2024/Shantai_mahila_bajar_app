import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { attachAuth } from './middleware/auth.js'
import { authRouter } from './routes/auth.routes.js'
import { sellersRouter } from './routes/sellers.routes.js'
import { productsRouter } from './routes/products.routes.js'
import { catalogRouter } from './routes/catalog.routes.js'
import { ordersRouter } from './routes/orders.routes.js'
import { feedbackRouter } from './routes/feedback.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { purgeExpiredRejectedProducts, resetDb } from './db/store.js'
import { SELLER_WEEK_SEED } from './db/seed.js'

const app = express()
const PORT = Number(process.env.PORT ?? 4000)

app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }))
app.use(express.json({ limit: '2mb' }))
app.use(attachAuth)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'shanta-mahila-bazar-api', time: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/sellers', sellersRouter)
app.use('/api/products', productsRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/admin', adminRouter)

app.get('/api/analytics/seller/:id/week', (req, res) => {
  res.json({ week: SELLER_WEEK_SEED[req.params.id] ?? null })
})

app.post('/api/dev/reset', (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' })
    return
  }
  resetDb()
  res.json({ ok: true })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api]', err)
  res.status(err.status ?? 500).json({
    error: err.message || 'Server error',
    messageMr: 'काहीतरी चूक झाली. पुन्हा प्रयत्न करा.',
  })
})

// Rejected products are retained for exactly 48 hours for seller visibility,
// then archived automatically even if no API request happens at that moment.
purgeExpiredRejectedProducts()
const rejectionCleanup = setInterval(purgeExpiredRejectedProducts, 60_000)
rejectionCleanup.unref()

app.listen(PORT, () => {
  console.log(`\n  Shanta Mahila Bazar API   http://localhost:${PORT}/api/health`)
  console.log(`  Admin API      http://localhost:${PORT}/api/admin/*  (backend only)`)
  console.log(`  OTP mode       ${process.env.MSG91_AUTH_KEY ? 'MSG91' : 'demo (any 4 digits)'}\n`)
})
