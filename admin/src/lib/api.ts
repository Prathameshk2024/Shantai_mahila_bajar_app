import type {
  AdminStats, Order, Product, ReadinessBand, Seller, SubscriptionPayment,
} from '@shared/types.js'

/**
 * The one seam between the console and the API.
 *
 * Same backend as the seller app - in development Vite proxies /api to
 * localhost:4000, in production VITE_API_URL points at the Render service.
 * Every call carries the admin bearer token; the API rejects anything else
 * with 401 at `adminRouter.use(requireRole('admin'))`.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'wb.admin.token'

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
    /* private mode - the session just will not survive a refresh */
  }
}

/**
 * Carries both languages. The API returns `error` in English and, on the
 * routes that matter, `messageMr` in Marathi; the console picks by the
 * language the admin is reading in rather than translating on the client.
 */
export class ApiError extends Error {
  status: number
  messageMr?: string

  constructor(status: number, body: { error?: string; messageMr?: string }) {
    super(body.error ?? 'Request failed')
    this.status = status
    this.messageMr = body.messageMr
  }

  /** The message to show, in the language on screen. */
  text(lang: string): string {
    return lang === 'mr' && this.messageMr ? this.messageMr : this.message
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()

  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(0, {
      error: 'Cannot reach the server',
      messageMr: 'सर्व्हरशी संपर्क होत नाही',
    })
  }

  const text = await res.text()
  let body: Record<string, unknown> = {}
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      // Not our API answering - usually the dev proxy reporting the backend
      // is down, which arrives as HTML with a 500.
      throw new ApiError(res.status, {
        error: `API did not respond (HTTP ${res.status})`,
        messageMr: 'सर्व्हरकडून उत्तर आले नाही',
      })
    }
  }

  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

const get = <T,>(p: string) => request<T>(p)
const post = <T,>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) })

/* ------------------------------------------------------------------ */
/* Shapes the admin endpoints return                                   */
/* ------------------------------------------------------------------ */

export interface AdminSession {
  token: string
  role: 'admin'
  userId: string
  name: string
}

export type PaymentRow = SubscriptionPayment & { waitingHours: number }
/** /admin/orders decorates each order with the seller's shop name and id. */
export type OrderRow = Order & { seller?: string; womenBizId?: string }
export type ProductRow = Product & { seller?: Seller }
export type SellerRow = Seller & {
  productCount: number
  slots: { used: number; total: number }
}

export interface ImpactReport {
  generatedAt: string
  totals: {
    women: number
    activeWomen: number
    womenWithEarnings: number
    earned: number
    orders: number
    villages: number
  }
  byVillage: { code: string; village: string; women: number; earned: number }[]
  readiness: { womenBizId: string; village: string; score: number; band: ReadinessBand }[]
}

export const api = {
  signIn: (email: string, password: string) =>
    post<{ session: AdminSession }>('/auth/admin/login', { email, password }),

  stats: () =>
    get<{ stats: AdminStats; bandLabels: Record<string, unknown> }>('/admin/stats'),

  /** status: PENDING (default) | APPROVED | REJECTED | ALL */
  payments: (status = 'PENDING') =>
    get<{ payments: PaymentRow[] }>(`/admin/payments?status=${encodeURIComponent(status)}`),

  approvePayment: (id: string) =>
    post<{ payment: SubscriptionPayment; seller?: Seller }>(`/admin/payments/${id}/approve`),

  rejectPayment: (id: string, reason: string) =>
    post<{ payment: SubscriptionPayment }>(`/admin/payments/${id}/reject`, { reason }),

  /** status: PENDING (default) | LIVE | REJECTED | ALL */
  products: (status = 'PENDING') =>
    get<{ products: ProductRow[] }>(`/admin/products?status=${encodeURIComponent(status)}`),

  moderateProduct: (id: string, approve: boolean, reason?: string) =>
    post<{ product: Product }>(`/admin/products/${id}/moderate`, { approve, reason }),

  sellers: () => get<{ sellers: SellerRow[] }>('/admin/sellers'),

  grantSlots: (id: string, packs: number) =>
    post<{ seller: Seller }>(`/admin/sellers/${id}/grant-slots`, { packs }),

  blockSeller: (id: string, blocked: boolean) =>
    post<{ seller: Seller }>(`/admin/sellers/${id}/block`, { blocked }),

  orders: (params: { status?: string; sellerId?: string; pincode?: string } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    const s = qs.toString()
    return get<{ orders: OrderRow[] }>(`/admin/orders${s ? `?${s}` : ''}`)
  },

  impact: () => get<ImpactReport>('/admin/impact'),
}
