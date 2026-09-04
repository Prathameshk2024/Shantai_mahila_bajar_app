import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { attachAuth } from './middleware/auth.js'
import { authRouter } from './routes/auth.routes.js'
import { sellersRouter } from './routes/sellers.routes.js'
import { productsRouter } from './routes/products.routes.js'
import { catalogRouter } from './routes/catalog.routes.js'
import { ordersRouter } from './routes/orders.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { flush, initStore, resetDb } from './db/store.js'
import { uploadsRouter } from './routes/uploads.routes.js'
import { customersRouter } from './routes/customers.routes.js'
import { CORS_ORIGIN, describeConfig, PORT as CONFIG_PORT } from './config.js'
import { SELLER_WEEK_SEED } from './db/seed.js'

const app = express()
const PORT = CONFIG_PORT

// A LIST, not a string: the seller/customer app and the admin site are
// deployed to different origins and both call this one API.
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '2mb' }))
app.use(attachAuth)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'shanta-mahila-bazar-api', time: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/sellers', sellersRouter)
app.use('/api/products', productsRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/customers', customersRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/uploads', uploadsRouter)

// Admin has no frontend in this repo by design - the admin site is separate.
app.use('/api/admin', adminRouter)

// Her growth chart. Real figures come from app_events / product_views once
// those are being written; the seed keeps the screen honest until then.
app.get('/api/analytics/seller/:id/week', (req, res) => {
  res.json({ week: SELLER_WEEK_SEED[req.params.id] ?? null })
})

// Development helper only.
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

/**
 * The store must finish loading before the first request. Otherwise a handler
 * can read seed data and then persist it straight over a real Firestore.
 */
async function main() {
  await initStore()

  app.listen(PORT, () => {
    console.log(`\n  Shanta Mahila Bazar API   http://localhost:${PORT}/api/health`)
    console.log(`  Admin API      http://localhost:${PORT}/api/admin/*  (backend only)`)
    console.log(describeConfig())
    console.log('')
  })
}

// Writes are coalesced over 400ms, so a shutdown mid-window would lose them.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void flush().finally(() => process.exit(0))
  })
}

main().catch((err) => {
  console.error('\n  Failed to start:', (err as Error).message)
  process.exit(1)
})
