import { Router } from 'express'
import type { Order, OrderStatus, PaymentMode, SellerGroup } from '@shared/types.js'
import { actionFor, canTransition, initialPaymentStatus } from '@shared/orderFlow.js'
import { getDb, save } from '../db/store.js'
import { recordOrderCustomer } from '../db/customers.js'
import { newShortId } from '../db/ids.js'
import { requireRole } from '../middleware/auth.js'

export const ordersRouter: Router = Router()

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

ordersRouter.get('/mine', requireRole('seller', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const list =
    auth.role === 'seller'
      ? db.orders.filter((o) => o.sellerId === auth.sellerId)
      : db.orders.filter((o) => o.customerId === auth.customerId)

  res.json({
    orders: [...list].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
  })
})

ordersRouter.get('/:id', requireRole('seller', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const order = db.orders.find((o) => o.id === req.params.id)
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  // An order is only visible to the two parties on it.
  const mine =
    (auth.role === 'seller' && order.sellerId === auth.sellerId) ||
    (auth.role === 'customer' && order.customerId === auth.customerId)
  if (!mine) {
    res.status(403).json({ error: 'Not your order' })
    return
  }

  /**
   * HER NUMBER, TO THE PERSON WHO ORDERED FROM HER - AND NOBODY ELSE.
   *
   * It is not on any public seller endpoint (`publicView` strips it), so
   * browsing the catalogue never exposes it. It IS on the order, from the
   * moment the order exists: a buyer who has paid by UPI and is waiting for
   * food needs to be able to ring the woman making it, and this route already
   * refuses anyone who is not one of the two parties, three lines up.
   *
   * It used to be withheld until she ACCEPTED, which is exactly backwards -
   * the gap between placing and accepting is the window in which a buyer most
   * needs to reach her.
   */
  const seller = db.sellers.find((s) => s.id === order.sellerId)
  res.json({
    order,
    seller: seller && {
      id: seller.id,
      womenBizId: seller.womenBizId,
      name: seller.name,
      photo: seller.photo,
      shopName: seller.shopName,
      shopSlug: seller.shopSlug,
      upiId: seller.upiId,
      phone: seller.phone,
    },
  })
})

/* ------------------------------------------------------------------ */
/* Checkout - one order per seller                                     */
/* ------------------------------------------------------------------ */

interface PlaceBody {
  address: { line: string; landmark?: string; pincode: string }
  groups: SellerGroup[]
  paymentMode: PaymentMode
  paymentUtr?: string
  customerName?: string
  sourceShareCode?: string
}

ordersRouter.post('/', requireRole('customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const b = req.body as PlaceBody

  if (!b.groups?.length) {
    res.status(400).json({ error: 'Empty cart', messageMr: 'टोपली रिकामी आहे' })
    return
  }
  if (!b.address?.pincode) {
    res.status(400).json({ error: 'Address required', messageMr: 'पत्ता निवडा' })
    return
  }

  // Serviceability and price are both re-derived from the database. Trusting
  // the client's totals is how a cart becomes a discount coupon.
  const groupId = `G${Date.now().toString(36).toUpperCase()}`
  const created: Order[] = []

  for (const g of b.groups) {
    const seller = db.sellers.find((s) => s.id === g.sellerId)
    if (!seller || seller.status !== 'ACTIVE' || !seller.isOpen) {
      res.status(409).json({
        error: 'Seller unavailable',
        messageMr: 'ही विक्रेती सध्या ऑर्डर घेत नाही',
      })
      return
    }
    if (!seller.pincodes.includes(b.address.pincode)) {
      res.status(409).json({
        error: 'Not serviceable',
        messageMr: `${seller.shopName} या पिनकोडमध्ये पोहोचवत नाहीत`,
      })
      return
    }

    const items = g.items.map((i) => {
      const product = db.products.find((p) => p.id === i.productId)
      if (!product || product.status !== 'LIVE') {
        throw Object.assign(new Error('Product unavailable'), { status: 409 })
      }
      return {
        productId: product.id,
        name: product.name,
        emoji: product.emoji,
        qty: Math.max(1, Number(i.qty)),
        price: product.price, // server price, not the client's
      }
    })

    const itemsTotal = items.reduce((n, i) => n + i.price * i.qty, 0)
    if (seller.minOrder > 0 && itemsTotal < seller.minOrder) {
      res.status(409).json({
        error: 'Below minimum',
        messageMr: `${seller.shopName} किमान ऑर्डर ₹${seller.minOrder}`,
      })
      return
    }

    const deliveryFee =
      seller.freeDeliveryAbove > 0 && itemsTotal >= seller.freeDeliveryAbove
        ? 0
        : seller.deliveryFee

    const now = new Date().toISOString()
    const order: Order = {
      id: newShortId('SMB', (id) => db.orders.some((o) => o.id === id)),
      groupId,
      sellerId: seller.id,
      customerId: auth.customerId!,
      customerName: b.customerName ?? 'ग्राहक',
      customerPhone: auth.phone ?? '',
      address: b.address.line,
      landmark: b.address.landmark,
      pincode: b.address.pincode,
      items,
      itemsTotal,
      deliveryFee,
      total: itemsTotal + deliveryFee,
      paymentMode: b.paymentMode,
      paymentStatus: initialPaymentStatus(b.paymentMode),
      paymentUtr: b.paymentMode === 'UPI' ? b.paymentUtr : undefined,
      status: 'PLACED',
      placedAt: now,
      events: [{ to: 'PLACED', at: now, by: 'customer' }],
      sourceShareCode: b.sourceShareCode,
    }

    db.orders.unshift(order)
    created.push(order)
    if (order.sourceShareCode === seller.shopSlug) seller.qrOrders += 1
  }

  // Remember who she is and where she asked for it. A cart split across three
  // sellers is three orders but one customer, so this runs once on the first.
  if (created[0]) recordOrderCustomer(db, created[0])

  save()
  res.status(201).json({ orders: created, groupId })
})

/* ------------------------------------------------------------------ */
/* Moving along the state machine                                      */
/* ------------------------------------------------------------------ */

ordersRouter.post('/:id/advance', requireRole('seller'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.sellerId === req.auth!.sellerId,
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }

  const to = req.body?.to as OrderStatus
  if (!canTransition(order.status, to)) {
    res.status(409).json({
      error: `Cannot go ${order.status} -> ${to}`,
      messageMr: 'हा बदल करता येणार नाही',
    })
    return
  }

  const action = actionFor(order.status, to)

  if (action?.needsReason && !req.body?.reason) {
    res.status(400).json({ error: 'Reason required', messageMr: 'कारण निवडा' })
    return
  }

  order.status = to
  order.events.push({
    to,
    at: new Date().toISOString(),
    by: 'seller',
    note: req.body?.reason,
  })

  // Cash is collected at the doorstep, so delivery and collection are the same
  // moment. UPI is confirmed separately, by her, before she packs.
  if (to === 'DELIVERED' && order.paymentMode === 'COD') {
    order.paymentStatus = 'COD_COLLECTED'
  }

  save()
  res.json({ order })
})

ordersRouter.post('/:id/confirm-payment', requireRole('seller'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.sellerId === req.auth!.sellerId,
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  if (order.paymentMode !== 'UPI') {
    res.status(409).json({ error: 'Not a UPI order' })
    return
  }
  order.paymentStatus = 'UPI_CONFIRMED'
  save()
  res.json({ order })
})
