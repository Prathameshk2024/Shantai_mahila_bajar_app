import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { CartItem, Product, Seller, SellerGroup } from '@shared/types.js'

/**
 * The cart is GROUPED BY SELLER, and that is not a display detail - it is the
 * data model. Delivery is arranged directly with each seller and payment goes
 * into each seller's own UPI, so a cart holding items from three sellers must
 * become three orders. Everything downstream depends on this.
 */

interface CartValue {
  items: CartItem[]
  count: number
  add: (p: Product, qty?: number) => void
  setQty: (productId: string, qty: number) => void
  remove: (productId: string) => void
  clear: () => void
  has: (productId: string) => boolean
  groupBySeller: (sellers: Partial<Seller>[]) => SellerGroup[]
}

const CartContext = createContext<CartValue | null>(null)
const KEY = 'wb.cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as CartItem[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [items])

  const add = useCallback((product: Product, qty = 1) => {
    setItems((cur) => {
      const found = cur.find((i) => i.productId === product.id)
      if (found) {
        return cur.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + qty } : i))
      }
      return [
        ...cur,
        {
          productId: product.id,
          sellerId: product.sellerId,
          name: product.name,
          emoji: product.emoji,
          price: product.price,
          unit: product.unit,
          qty,
        },
      ]
    })
  }, [])

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((cur) =>
      qty <= 0
        ? cur.filter((i) => i.productId !== productId)
        : cur.map((i) => (i.productId === productId ? { ...i, qty } : i)),
    )
  }, [])

  const remove = useCallback(
    (productId: string) => setItems((cur) => cur.filter((i) => i.productId !== productId)),
    [],
  )
  const clear = useCallback(() => setItems([]), [])
  const has = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items],
  )
  const count = useMemo(() => items.reduce((n, i) => n + i.qty, 0), [items])

  /** Split into one group per seller, applying that seller's delivery rules. */
  const groupBySeller = useCallback(
    (sellers: Partial<Seller>[]): SellerGroup[] => {
      const bySeller = new Map<string, CartItem[]>()
      for (const item of items) {
        const list = bySeller.get(item.sellerId) ?? []
        list.push(item)
        bySeller.set(item.sellerId, list)
      }
      return [...bySeller.entries()].map(([sellerId, list]) => {
        const seller = sellers.find((s) => s.id === sellerId) as Seller | undefined
        const itemsTotal = list.reduce((n, i) => n + i.price * i.qty, 0)
        const freeAbove = seller?.freeDeliveryAbove ?? 0
        const deliveryFee =
          freeAbove > 0 && itemsTotal >= freeAbove ? 0 : (seller?.deliveryFee ?? 0)
        const minOrder = seller?.minOrder ?? 0
        return {
          sellerId,
          seller,
          items: list,
          itemsTotal,
          deliveryFee,
          total: itemsTotal + deliveryFee,
          minOrder,
          belowMinimum: minOrder > 0 && itemsTotal < minOrder,
        }
      })
    },
    [items],
  )

  const value = useMemo(
    () => ({ items, count, add, setQty, remove, clear, has, groupBySeller }),
    [items, count, add, setQty, remove, clear, has, groupBySeller],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
