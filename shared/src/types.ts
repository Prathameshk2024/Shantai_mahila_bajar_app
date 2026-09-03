/**
 * Types shared by the frontend and the backend.
 *
 * This folder is the single source of truth for anything that crosses the
 * wire. Both tsconfigs alias it to `@shared/*`, so a change here is a compile
 * error on whichever side has not caught up - which is the whole reason this
 * project is in TypeScript.
 */

/* ------------------------------------------------------------------ */
/* Roles & auth                                                        */
/* ------------------------------------------------------------------ */

export type Role = 'seller' | 'customer' | 'admin'

export interface Session {
  token: string
  role: Role
  userId: string
  phone?: string
  name?: string
  /** Present only for sellers. */
  sellerId?: string
  /** Present only for customers. */
  customerId?: string
}

/* ------------------------------------------------------------------ */
/* Order lifecycle                                                     */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'

export type PaymentMode = 'COD' | 'UPI'

export type PaymentStatus =
  | 'COD_PENDING'
  | 'COD_COLLECTED'
  | 'UPI_SUBMITTED'
  | 'UPI_CONFIRMED'

export interface OrderEvent {
  to: OrderStatus
  at: string
  by: 'customer' | 'seller' | 'admin' | 'system'
  note?: string
}

export interface OrderItem {
  productId: string
  name: string
  emoji: string
  qty: number
  price: number
}

export interface Order {
  id: string
  groupId?: string
  sellerId: string
  customerId: string
  customerName: string
  customerPhone: string
  address: string
  landmark?: string
  pincode: string
  items: OrderItem[]
  itemsTotal: number
  deliveryFee: number
  total: number
  paymentMode: PaymentMode
  paymentStatus: PaymentStatus
  paymentUtr?: string
  status: OrderStatus
  /** The customer's 4-digit code. The seller must enter it to close the order. */
  deliveryOtp: string
  placedAt: string
  events: OrderEvent[]
  sourceShareCode?: string
}

/* ------------------------------------------------------------------ */
/* Seller                                                              */
/* ------------------------------------------------------------------ */

export type SellerStatus =
  | 'REGISTERED'
  | 'PAYMENT_SUBMITTED'
  | 'ACTIVE'
  | 'PAYMENT_REJECTED'
  | 'BLOCKED'

export type BusinessType = 'individual' | 'shg' | 'udyam'

export type DispatchTime = 'same' | '1' | '23'

/**
 * The six digital-usage answers behind the Shanta Mahila Bazar Digital Readiness Index.
 * Collected once at registration and re-measured after training, so the
 * before/after comparison the research design needs is possible at all.
 */
export interface DigitalProfile {
  smartphone: boolean
  internet: boolean
  upi: boolean
  whatsappBusiness: boolean
  socialMedia: boolean
  digitalMarketing: boolean
}

export interface Seller {
  id: string
  /** Shanta Mahila Bazar ID, e.g. WB-ANADUR-001. Printed on packaging and posters. */
  womenBizId: string

  // personal
  name: string
  photo: string
  phone: string
  whatsapp?: string
  age?: number
  education?: string

  // location
  village: string
  villageCode: string
  taluka: string
  district: string
  pincode: string

  // business
  shopName: string
  shopSlug: string
  about?: string
  businessType: BusinessType
  shgName?: string
  yearsInBusiness?: number
  /** Units she can make per month. Drives what admin can realistically promise. */
  monthlyCapacity?: number
  sellsFood: boolean
  fssai?: string
  fssaiExpiry?: string

  // money in
  upiId: string
  upiVerified: boolean

  // digital readiness
  digital: DigitalProfile
  readinessScore: number
  readinessBand: ReadinessBand

  // shop settings
  isOpen: boolean
  deliveryFee: number
  freeDeliveryAbove: number
  minOrder: number
  dispatch: DispatchTime
  pincodes: string[]

  // platform
  status: SellerStatus
  packsApproved: number
  rating: number
  ratingCount: number
  qrScans: number
  qrOrders: number
  createdAt: string
}

export type ReadinessBand = 'starter' | 'basic' | 'advanced' | 'digital'

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export type ProductStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'LIVE'
  | 'REJECTED'
  | 'PAUSED'
  | 'ARCHIVED'

export type Unit = 'kg' | 'g' | 'piece' | 'dozen' | 'litre' | 'ml' | 'set'

export interface Product {
  id: string
  sellerId: string
  emoji: string
  name: string
  nameEn?: string
  categoryId: string
  isFood: boolean

  // food only - all four are required when isFood is true
  fssai?: string
  fssaiExpiry?: string
  ingredients?: string
  vegType?: 'veg' | 'nonveg'

  // non-food only
  material?: string

  price: number
  mrp: number
  unit: Unit
  stock: number
  madeToOrder?: boolean

  status: ProductStatus
  rejectReason?: string
  views: number
  createdAt: string
}

export interface Category {
  id: string
  icon: string
  mr: string
  en: string
  food: boolean
}

/* ------------------------------------------------------------------ */
/* Subscription                                                        */
/* ------------------------------------------------------------------ */

export type PaymentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface SubscriptionPayment {
  id: string
  sellerId: string
  sellerName: string
  womenBizId: string
  phone: string
  amount: number
  utr: string
  payerUpi: string
  screenshotUrl?: string
  submittedAt: string
  status: PaymentApprovalStatus
  /** Set when the same reference number was already used by someone else. */
  duplicateUtr: boolean
  verifiedAt?: string
  verifiedBy?: string
  rejectReason?: string
}

export interface AdminPaymentAccount {
  label: string
  upiId: string
  bankName: string
  accountNo: string
  ifsc: string
}

/* ------------------------------------------------------------------ */
/* Addresses & cart                                                    */
/* ------------------------------------------------------------------ */

export interface Address {
  id: string
  label: string
  line: string
  landmark?: string
  city: string
  pincode: string
  isDefault: boolean
}

export interface CartItem {
  productId: string
  sellerId: string
  name: string
  emoji: string
  price: number
  unit: Unit
  qty: number
}

/** A cart split into one bucket per seller. Each becomes its own order. */
export interface SellerGroup {
  sellerId: string
  seller?: Seller
  items: CartItem[]
  itemsTotal: number
  deliveryFee: number
  total: number
  minOrder: number
  belowMinimum: boolean
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface WeekDay {
  d: string
  dEn: string
  v: number
}

export interface SellerWeek {
  days: WeekDay[]
  lastWeekTotal: number
  ordersThisWeek: number
  ordersLastWeek: number
  views: number
  ordered: number
  repeatCustomers: number
}

export interface AdminStats {
  gmvMonth: number
  ordersToday: number
  ordersWeek: number
  activeSellers: number
  totalSellers: number
  newRegistrations: number
  pendingPayments: number
  pendingProducts: number
  stuckOrders: number
  openDisputes: number
  womenEarnedTotal: number
  womenEarnedMonth: number
  womenWithFirstEarning: number
  subscriptionRevenue: number
  repurchaseRate: number
  funnel: { mr: string; en: string; v: number }[]
  earningBands: { label: string; v: number }[]
  readinessBands: { band: ReadinessBand; v: number }[]
}

/* ------------------------------------------------------------------ */
/* API envelope                                                        */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string
  /** Marathi message, safe to show a seller directly. */
  messageMr?: string
  fields?: Record<string, string>
}
