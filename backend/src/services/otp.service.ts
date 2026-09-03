/**
 * MSG91 OTP.
 *
 * The skeleton keeps codes in memory and accepts any 4 digits so the app is
 * walkable offline. Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID to switch to real
 * SMS - the two fetch calls below are the actual MSG91 endpoints.
 *
 * The auth key never leaves this process. It must not be bundled into the
 * frontend under any circumstance.
 */

const AUTH_KEY = process.env.MSG91_AUTH_KEY
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID
const SENDER = process.env.MSG91_SENDER ?? 'WMNBIZ'

/** phone -> { code, expiresAt }. Redis in production; a Map is fine for one node. */
const pending = new Map<string, { code: string; expiresAt: number }>()

const TTL_MS = 5 * 60 * 1000
const RESEND_WINDOW_MS = 30 * 1000
const lastSentAt = new Map<string, number>()

export interface SendOtpResult {
  sent: boolean
  /** Only present in demo mode, so the skeleton can show the code on screen. */
  demoCode?: string
  cooldownMs?: number
}

export async function sendOtp(phone: string): Promise<SendOtpResult> {
  // Rate limit. Without this, the endpoint is an SMS-billing DoS.
  const last = lastSentAt.get(phone) ?? 0
  const since = Date.now() - last
  if (since < RESEND_WINDOW_MS) {
    return { sent: false, cooldownMs: RESEND_WINDOW_MS - since }
  }
  lastSentAt.set(phone, Date.now())

  const code = String(Math.floor(1000 + Math.random() * 9000))
  pending.set(phone, { code, expiresAt: Date.now() + TTL_MS })

  if (!AUTH_KEY || !TEMPLATE_ID) {
    console.log(`[otp] demo mode - code for ${phone} is ${code}`)
    return { sent: true, demoCode: code }
  }

  const url = new URL('https://control.msg91.com/api/v5/otp')
  url.searchParams.set('template_id', TEMPLATE_ID)
  url.searchParams.set('mobile', `91${phone}`)
  url.searchParams.set('otp', code)
  url.searchParams.set('sender', SENDER)

  const resp = await fetch(url, {
    method: 'POST',
    headers: { authkey: AUTH_KEY, 'Content-Type': 'application/json' },
  })
  if (!resp.ok) {
    console.error('[otp] MSG91 send failed', resp.status, await resp.text())
    return { sent: false }
  }
  return { sent: true }
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  if (!/^\d{4,6}$/.test(code)) return false

  if (!AUTH_KEY) {
    // Demo mode: accept the generated code, and any 4 digits so the skeleton
    // works without SMS. Remove the second clause the moment MSG91 is wired.
    const rec = pending.get(phone)
    if (rec && rec.expiresAt > Date.now() && rec.code === code) {
      pending.delete(phone)
      return true
    }
    return /^\d{4}$/.test(code)
  }

  const url = new URL('https://control.msg91.com/api/v5/otp/verify')
  url.searchParams.set('mobile', `91${phone}`)
  url.searchParams.set('otp', code)

  const resp = await fetch(url, { method: 'GET', headers: { authkey: AUTH_KEY } })
  if (!resp.ok) return false
  const body = (await resp.json()) as { type?: string }
  return body.type === 'success'
}
