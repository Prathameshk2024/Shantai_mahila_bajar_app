import { Router } from 'express'
import { isValidPhone } from '@shared/seller.js'
import { getDb } from '../db/store.js'
import { signToken } from '../middleware/auth.js'
import { sendOtp, verifyOtp } from '../services/otp.service.js'

/**
 * Phone + OTP. Verification happens HERE, on the server, never on the client -
 * a client that decides for itself whether the code was right is not auth.
 */
export const authRouter: Router = Router()

authRouter.post('/otp/send', async (req, res) => {
  const phone = String(req.body?.phone ?? '').replace(/\D/g, '')
  if (!isValidPhone(phone)) {
    res.status(400).json({
      error: 'Invalid phone',
      messageMr: '10 अंकी मोबाईल नंबर टाका',
      fields: { phone: 'invalid' },
    })
    return
  }
  const result = await sendOtp(phone)
  res.json(result)
})

authRouter.post('/otp/verify', async (req, res) => {
  const phone = String(req.body?.phone ?? '').replace(/\D/g, '')
  const code = String(req.body?.code ?? '')
  const role = req.body?.role === 'seller' ? 'seller' : 'customer'

  const ok = await verifyOtp(phone, code)
  if (!ok) {
    res.status(401).json({ error: 'Wrong OTP', messageMr: 'OTP चुकीचा आहे. पुन्हा टाका.' })
    return
  }

  const db = getDb()

  if (role === 'seller') {
    const seller = db.sellers.find((s) => s.phone === phone)
    if (!seller) {
      // Known number, no seller record yet: the client sends her to registration.
      res.json({ registered: false, phone })
      return
    }
    const token = signToken({ role: 'seller', userId: seller.id, phone, sellerId: seller.id })
    res.json({
      registered: true,
      session: {
        token, role: 'seller', userId: seller.id, phone,
        name: seller.name, sellerId: seller.id,
      },
    })
    return
  }

  // Customers need no registration step - the phone IS the account.
  const customerId = `c-${phone}`
  const token = signToken({ role: 'customer', userId: customerId, phone, customerId })
  res.json({
    registered: true,
    session: { token, role: 'customer', userId: customerId, phone, customerId },
  })
})

/**
 * Admin sign-in. There is no admin frontend in this repo by design - the client
 * wants a separate admin site - so this exists to issue a token that the
 * separate admin app (or curl / Postman) can use against /api/admin/*.
 */
authRouter.post('/admin/login', (req, res) => {
  const email = String(req.body?.email ?? '')
  const password = String(req.body?.password ?? '')

  // Replace with Firebase Auth + an `admin` custom claim, enforced in security
  // rules as well as here. Do not ship this comparison.
  const expected = process.env.ADMIN_PASSWORD ?? 'changeme'
  if (!email || password !== expected) {
    res.status(401).json({ error: 'Bad credentials' })
    return
  }

  const token = signToken({ role: 'admin', userId: email })
  res.json({ session: { token, role: 'admin', userId: email, name: email } })
})
