import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { Role } from '@shared/types.js'
import { SESSION_SECRET } from '../config.js'

/**
 * Session handling.
 *
 * The token is `base64url(payload).base64url(HMAC-SHA256(payload))`. The
 * payload is readable by anyone holding the token - it is not encrypted - but
 * it cannot be edited, because changing a byte invalidates the signature.
 *
 * That matters more than it looks: the payload carries the customer id, and
 * the customer id is what /api/customers/me resolves her saved home addresses
 * from. Before signing, editing one base64 string was enough to read another
 * woman's address.
 *
 * Who she is still comes from the MSG91 OTP check at login. This only stops
 * the session she was issued from being rewritten afterwards.
 *
 * To go live on Firebase Auth instead: mint a Firebase custom token after the
 * OTP check and have the client sign in with it; this middleware then becomes
 * `getAuth().verifyIdToken(bearer)`. Admin is gated by a custom claim, and the
 * same rule is repeated in Firestore security rules - never in the UI alone.
 */

export interface AuthContext {
  role: Role
  userId: string
  phone?: string
  sellerId?: string
  customerId?: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
}

export function signToken(ctx: AuthContext): string {
  const payload = Buffer.from(JSON.stringify(ctx), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token: string): AuthContext | null {
  try {
    const dot = token.indexOf('.')
    // No separator means the old unsigned format, or a hand-crafted blob.
    if (dot < 1) return null

    const payload = token.slice(0, dot)
    const provided = token.slice(dot + 1)
    const expected = sign(payload)

    // timingSafeEqual throws on a length mismatch, so check that first.
    if (provided.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null

    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthContext
    if (!parsed?.role || !parsed?.userId) return null
    return parsed
  } catch {
    return null
  }
}

/** Attaches req.auth when a bearer token is present. Never rejects. */
export function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const ctx = verifyToken(header.slice(7))
    if (ctx) req.auth = ctx
  }
  next()
}

/** Rejects unless the caller holds one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Not signed in', messageMr: 'कृपया पुन्हा लॉगिन करा' })
      return
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Not allowed', messageMr: 'तुम्हाला परवानगी नाही' })
      return
    }
    next()
  }
}

/** The seller id the caller is allowed to act as. */
export function callerSellerId(req: Request): string | undefined {
  return req.auth?.sellerId
}
