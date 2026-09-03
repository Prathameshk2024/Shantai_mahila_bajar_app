import type { NextFunction, Request, Response } from 'express'
import type { Role } from '@shared/types.js'

/**
 * Session handling.
 *
 * The token here is a base64 blob, NOT a signed credential - anyone could forge
 * one. That is acceptable in the skeleton and unacceptable in production.
 *
 * To go live: your Node endpoint verifies the OTP with MSG91, mints a Firebase
 * custom token, and the client signs in with it. This middleware then becomes
 * `getAuth().verifyIdToken(bearer)` and `req.auth` comes from the decoded
 * claims. Admin is gated by a custom claim, and the same rule is repeated in
 * Firestore security rules - never in the UI alone.
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

export function signToken(ctx: AuthContext): string {
  return Buffer.from(JSON.stringify(ctx), 'utf8').toString('base64url')
}

export function verifyToken(token: string): AuthContext | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    const parsed = JSON.parse(raw) as AuthContext
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
