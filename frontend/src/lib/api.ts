import type {
  Address, AdminPaymentAccount, Category, DigitalProfile, Order, Product,
  Seller, SellerGroup, SellerWeek, Session, SubscriptionPayment,
} from '@shared/types.js'
import type { SlotInfo } from '@shared/seller.js'

/**
 * The single seam between the app and the server.
 *
 * No screen calls fetch directly. In development Vite proxies /api to
 * localhost:4000; in the APK build VITE_API_URL points at the deployed API,
 * because there is no dev server inside a Capacitor WebView to proxy through.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'wb.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode - the session just won't survive a refresh */
  }
}

/** Thrown for any non-2xx. Carries the Marathi message and per-field errors. */
export class ApiError extends Error {
  status: number
  messageMr?: string
  fields?: Record<string, string>

  constructor(status: number, body: { error?: string; messageMr?: string; fields?: Record<string, string> }) {
    super(body.error ?? 'Request failed')
    this.status = status
    this.messageMr = body.messageMr
    this.fields = body.fields
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const text = await res.text()
  const body = text ? JSON.parse(text) : {}

  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

const get = <T,>(p: string) => request<T>(p)
const post = <T,>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) })
const patch = <T,>(p: string, body: unknown) =>
  request<T>(p, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T,>(p: string) => request<T>(p, { method: 'DELETE' })

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const api = {
  sendOtp: (phone: string) =>
    post<{ sent: boolean; demoCode?: string; cooldownMs?: number }>('/auth/otp/send', { phone }),

  verifyOtp: (phone: string, code: string, role: 'seller' | 'customer') =>
    post<{ registered: boolean; session?: Session; phone?: string }>('/auth/otp/verify', {
      phone, code, role,
    }),

  /* ---------------- seller ---------------- */

  registerSeller: (body: SellerRegistration) =>
    post<{ seller: Seller; session: Session }>('/sellers/register', body),

  me: () => get<{ seller: Seller; slots: SlotInfo }>('/sellers/me'),

  updateMe: (patchBody: Partial<Seller>) =>
    patch<{ seller: Seller }>('/sellers/me', patchBody),

  sellerBySlug: (slug: string) => get<{ seller: Seller }>(`/sellers/slug/${slug}`),
  sellerById: (id: string) => get<{ seller: Seller }>(`/sellers/${id}`),

  subscription: () =>
    get<{
      plan: { price: number; slotsPerPack: number }
      account: AdminPaymentAccount
      slots: SlotInfo
      status: Seller['status']
      payments: SubscriptionPayment[]
    }>('/sellers/me/subscription'),

  submitPayment: (utr: string, payerUpi?: string) =>
    post<{ payment: SubscriptionPayment; status: Seller['status'] }>(
      '/sellers/me/subscription/payment',
      { utr, payerUpi },
    ),

  /* ---------------- products ---------------- */

  myProducts: () => get<{ products: Product[]; slots: SlotInfo }>('/products/mine'),

  createProduct: (body: Partial<Product> & { asDraft?: boolean }) =>
    post<{ product: Product }>('/products', body),

  updateProduct: (id: string, body: Partial<Product>) =>
    patch<{ product: Product }>(`/products/${id}`, body),

  archiveProduct: (id: string) => del<{ ok: true; slots: SlotInfo }>(`/products/${id}`),

  /* ---------------- catalog (public) ---------------- */

  categories: () => get<{ categories: Category[] }>('/catalog/categories'),

  catalog: (params: { categoryId?: string; q?: string; pincode?: string } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    const s = qs.toString()
    return get<{ products: (Product & { seller?: Partial<Seller> })[] }>(
      `/catalog/products${s ? `?${s}` : ''}`,
    )
  },

  product: (id: string) => get<{ product: Product; seller?: Seller }>(`/catalog/products/${id}`),
  addresses: () => get<{ addresses: Address[] }>('/catalog/addresses'),

  /* ---------------- orders ---------------- */

  myOrders: () => get<{ orders: Order[] }>('/orders/mine'),
  order: (id: string) => get<{ order: Order; seller?: Partial<Seller> }>(`/orders/${id}`),

  placeOrders: (body: {
    address: { line: string; landmark?: string; pincode: string }
    groups: SellerGroup[]
    paymentMode: 'COD' | 'UPI'
    paymentUtr?: string
    customerName?: string
  }) => post<{ orders: Order[]; groupId: string }>('/orders', body),

  advanceOrder: (id: string, to: Order['status'], extra?: { otp?: string; reason?: string }) =>
    post<{ order: Order }>(`/orders/${id}/advance`, { to, ...extra }),

  confirmPayment: (id: string) => post<{ order: Order }>(`/orders/${id}/confirm-payment`),

  /* ---------------- analytics ---------------- */

  sellerWeek: (id: string) => get<{ week: SellerWeek | null }>(`/analytics/seller/${id}/week`),
}

export interface SellerRegistration {
  phone: string
  name: string
  age?: number
  education?: string
  whatsapp?: string
  village: string
  taluka: string
  district: string
  pincode: string
  shopName: string
  about?: string
  businessType: Seller['businessType']
  shgName?: string
  yearsInBusiness?: number
  monthlyCapacity?: number
  sellsFood: boolean
  fssai?: string
  fssaiExpiry?: string
  upiId: string
  digital: DigitalProfile
  deliveryFee?: number
  minOrder?: number
  dispatch?: Seller['dispatch']
}
