import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Address, Seller } from '@shared/types.js'
import { STATUS_STYLE, statusLabelKey } from '@shared/orderFlow.js'
import { buildUpiLink } from '@shared/seller.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { useCart } from '../../store/CartContext.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, Button, Card, Choice, EmptyState, Field, Loading, Notice,
  Pill, Rupees, SectionTitle, Stepper, TextInput, useAsync,
} from '../../components/ui.js'
import { Timeline } from '../seller/Orders.js'

/**
 * Cart - grouped by seller, because each seller becomes a separate order with
 * its own delivery charge AND its own payment.
 */
export function Cart() {
  const t = useT()
  const nav = useNavigate()
  const { setQty, count, groupBySeller } = useCart()

  // Sellers come from the catalog, which already carries a seller card per item.
  const [data, loading] = useAsync(() => api.catalog(), [])

  if (loading) return <><AppBar title={t('nav.cart')} /><div className="screen"><Loading /></div></>

  if (count === 0) {
    return (
      <>
        <AppBar title={t('nav.cart')} />
        <div className="screen">
          <Card>
            <EmptyState
              icon="🧺"
              title={t('cus.cartEmpty')}
              body={t('cus.cartEmptySub')}
              action={<Button onClick={() => nav('/shop')}>{t('cus.startShopping')}</Button>}
            />
          </Card>
        </div>
      </>
    )
  }

  const sellers = dedupeSellers(data?.products ?? [])
  const groups = groupBySeller(sellers)
  const grand = groups.reduce((n, g) => n + g.total, 0)
  const blocked = groups.some((g) => g.belowMinimum)

  return (
    <>
      <AppBar title={t('nav.cart')} sub={`${count} ${t('ord.items')}`} />
      <div className="screen stack">
        {groups.length > 1 && <Notice tone="info">{t('cus.perSellerNote')}</Notice>}

        {groups.map((g) => (
          <Card key={g.sellerId}>
            <div className="row" style={{ marginBottom: 'var(--s3)' }}>
              <span style={{ fontSize: '1.5rem' }} aria-hidden="true">{g.seller?.photo}</span>
              <div className="grow">
                <div className="small dim">{t('cus.fromSeller')}</div>
                <strong>{g.seller?.shopName}</strong>
              </div>
            </div>

            <div className="stack-sm">
              {g.items.map((i) => (
                <div key={i.productId} className="row-between">
                  <div className="row">
                    <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>{i.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{i.name}</div>
                      <div className="small dim"><Rupees value={i.price} /> / {t(`unit.${i.unit}`)}</div>
                    </div>
                  </div>
                  <Stepper value={i.qty} onChange={(v) => setQty(i.productId, v)} min={0} />
                </div>
              ))}
            </div>

            <hr className="divider" />

            <div className="stack-sm small">
              <div className="row-between">
                <span className="dim">{t('cus.itemTotal')}</span>
                <Rupees value={g.itemsTotal} />
              </div>
              <div className="row-between">
                <span className="dim">{t('cus.deliveryFee')}</span>
                {g.deliveryFee === 0
                  ? <span className="pill pill--ok">मोफत</span>
                  : <Rupees value={g.deliveryFee} />}
              </div>
              <div className="row-between" style={{ fontSize: 'var(--t-base)' }}>
                <strong>{t('cus.grandTotal')}</strong>
                <strong><Rupees value={g.total} /></strong>
              </div>
            </div>

            {g.belowMinimum && (
              <div style={{ marginTop: 'var(--s3)' }}>
                <Notice tone="warn">किमान ऑर्डर <Rupees value={g.minOrder} /></Notice>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="actionbar">
        <div className="row-between">
          <strong>{t('cus.grandTotal')}</strong>
          <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={grand} /></strong>
        </div>
        <Button disabled={blocked} onClick={() => nav('/shop/checkout')}>
          {t('cus.checkout')} →
        </Button>
      </div>
    </>
  )
}

function dedupeSellers(products: { seller?: Partial<Seller> }[]): Partial<Seller>[] {
  const map = new Map<string, Partial<Seller>>()
  for (const p of products) if (p.seller?.id) map.set(p.seller.id, p.seller)
  return [...map.values()]
}

/* ================================================================== */
/* Checkout - address, then a payment step PER SELLER                   */
/* ================================================================== */

export function Checkout() {
  const t = useT()
  const nav = useNavigate()
  const { session } = useAuth()
  const { groupBySeller, clear } = useCart()

  const [catalogData, loadingCatalog] = useAsync(() => api.catalog(), [])
  const [addrData, loadingAddr] = useAsync(() => api.addresses(), [])

  const [addressId, setAddressId] = useState<string | null>(null)
  const [mode, setMode] = useState<'COD' | 'UPI'>('COD')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (loadingCatalog || loadingAddr) {
    return <><AppBar title={t('cus.checkout')} backTo="/shop/cart" /><div className="screen"><Loading /></div></>
  }

  const addresses: Address[] = addrData?.addresses ?? []
  const sellers = dedupeSellers(catalogData?.products ?? [])
  const groups = groupBySeller(sellers)
  const address =
    addresses.find((a) => a.id === addressId) ??
    addresses.find((a) => a.isDefault) ??
    addresses[0]
  const grand = groups.reduce((n, g) => n + g.total, 0)

  // Serviceability is re-checked on the server too; this is the friendly warning.
  const unserviceable = groups.filter(
    (g) => address && !(g.seller?.pincodes ?? []).includes(address.pincode),
  )

  async function place() {
    if (!address) return
    setBusy(true)
    setErr('')
    try {
      const res = await api.placeOrders({
        address: { line: address.line, landmark: address.landmark, pincode: address.pincode },
        groups,
        paymentMode: mode,
        paymentUtr: mode === 'UPI' ? utr : undefined,
        customerName: session?.name ?? 'ग्राहक',
      })
      clear()
      nav(`/shop/placed/${res.orders[0]!.id}`, { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar title={t('cus.checkout')} backTo="/shop/cart" />
      <div className="screen stack">
        <div>
          <SectionTitle>{t('cus.chooseAddress')}</SectionTitle>
          <div className="stack-sm">
            {addresses.map((a) => (
              <Choice
                key={a.id}
                selected={address?.id === a.id}
                onSelect={() => setAddressId(a.id)}
                icon={a.label === 'घर' ? '🏠' : '🏢'}
                title={a.label}
                sub={`${a.line}, ${a.city} - ${a.pincode}`}
              />
            ))}
          </div>
        </div>

        {unserviceable.length > 0 && (
          <Notice tone="warn">
            {unserviceable.map((g) => g.seller?.shopName).join(', ')} — {t('cus.notServiceable')}
          </Notice>
        )}

        <div>
          <SectionTitle>{t('cus.choosePayment')}</SectionTitle>
          <div className="stack-sm">
            <Choice selected={mode === 'COD'} onSelect={() => setMode('COD')} icon="💵" title={t('cus.payCod')} />
            <Choice
              selected={mode === 'UPI'}
              onSelect={() => setMode('UPI')}
              icon="📱"
              title={t('cus.payUpi')}
              sub={t('cus.payUpiSub')}
            />
          </div>
        </div>

        {/* One payment block per seller. The link is generated from HER UPI ID
            with the amount already in it, so the customer cannot mistype it. */}
        {mode === 'UPI' && (
          <div className="stack-sm">
            {groups.map((g) => {
              const link = buildUpiLink({
                upiId: g.seller?.upiId ?? '',
                name: g.seller?.shopName,
                amount: g.total,
                note: 'Shanta Mahila Bazar order',
              })
              return (
                <Card key={g.sellerId}>
                  <div className="row-between" style={{ marginBottom: 'var(--s3)' }}>
                    <div className="row">
                      <span style={{ fontSize: '1.5rem' }} aria-hidden="true">{g.seller?.photo}</span>
                      <div>
                        <div className="small dim">{t('cus.payTo')}</div>
                        <strong>{g.seller?.shopName}</strong>
                      </div>
                    </div>
                    <strong><Rupees value={g.total} /></strong>
                  </div>
                  <div
                    style={{
                      aspectRatio: 1, maxWidth: 150, margin: '0 auto var(--s3)',
                      background: 'var(--surface-2)', border: '1px solid var(--line)',
                      borderRadius: 'var(--r)', display: 'grid', placeItems: 'center',
                      fontSize: '2.5rem',
                    }}
                  >
                    🔳
                  </div>
                  <a className="btn" href={link}>{t('cus.payNow')} · ₹{g.total}</a>
                  <div className="tiny dim center" style={{ marginTop: 6 }}>{g.seller?.upiId}</div>
                </Card>
              )
            })}
            <Field label={t('cus.enterUtr')} required>
              <TextInput
                inputMode="numeric"
                value={utr}
                onChange={(e) => setUtr(e.target.value.replace(/\s/g, ''))}
                placeholder="512309887711"
              />
            </Field>
          </div>
        )}

        <Card>
          <div className="row-between">
            <strong>{t('cus.grandTotal')}</strong>
            <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={grand} /></strong>
          </div>
          {groups.length > 1 && (
            <div className="small dim" style={{ marginTop: 6 }}>
              {groups.length} विक्रेत्या · {groups.length} ऑर्डर
            </div>
          )}
        </Card>

        {err && <Notice tone="danger">{err}</Notice>}
      </div>

      <div className="actionbar">
        <Button
          onClick={() => void place()}
          disabled={busy || !address || unserviceable.length > 0 || (mode === 'UPI' && utr.length < 6)}
        >
          {busy ? t('common.loading') : t('cus.placeOrder')}
        </Button>
      </div>
    </>
  )
}

/* ================================================================== */
/* Order placed - the OTP is the hero of this screen                    */
/* ================================================================== */

export function OrderPlaced() {
  const { orderId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.order(orderId!), [orderId])

  if (loading) return <div className="app-shell"><div className="screen"><Loading /></div></div>
  if (!data) return <div className="app-shell"><div className="screen"><EmptyState title="—" /></div></div>

  const order = data.order

  return (
    <div className="app-shell">
      <div className="screen screen--nonav stack">
        <div className="center stack-sm" style={{ paddingTop: 'var(--s5)' }}>
          <div style={{ fontSize: '4rem' }} aria-hidden="true">🎉</div>
          <h1 className="h1">{t('cus.orderPlaced')}</h1>
          <p className="dim num">{order.id}</p>
        </div>

        {/* Shown large and early. Without this the seller can mark an
            undelivered order as delivered and nothing would catch it. */}
        <Card style={{ textAlign: 'center', borderColor: 'var(--accent)', borderWidth: 2 }}>
          <div className="small dim">{t('cus.yourOtp')}</div>
          <div
            className="num"
            style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '0.12em', lineHeight: 1.2 }}
          >
            {order.deliveryOtp}
          </div>
          <p className="small muted" style={{ marginTop: 'var(--s2)' }}>{t('cus.otpInstruction')}</p>
        </Card>

        <Button onClick={() => nav(`/shop/orders/${order.id}`, { replace: true })}>
          {t('cus.trackOrder')}
        </Button>
        <Button variant="quiet" onClick={() => nav('/shop', { replace: true })}>
          {t('cus.startShopping')}
        </Button>
      </div>
    </div>
  )
}

export function CustomerOrders() {
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.myOrders(), [])
  const orders = data?.orders ?? []

  return (
    <>
      <AppBar title={t('cus.myOrders')} backTo="/shop/profile" />
      <div className="screen stack-sm">
        {loading ? (
          <Loading />
        ) : orders.length === 0 ? (
          <Card><EmptyState icon="🧾" title={t('ord.noOrders')} /></Card>
        ) : (
          orders.map((o) => (
            <button key={o.id} className="tile" onClick={() => nav(`/shop/orders/${o.id}`)}>
              <div className="tile__img" aria-hidden="true">{STATUS_STYLE[o.status].icon}</div>
              <div className="tile__body">
                <div className="tile__title">{o.items.map((i) => i.name).join(', ')}</div>
                <div className="tile__meta">{o.id}</div>
                <div style={{ marginTop: 4 }}>
                  <Pill tone={STATUS_STYLE[o.status].tone} icon={STATUS_STYLE[o.status].icon}>
                    {t(statusLabelKey(o.status))}
                  </Pill>
                </div>
              </div>
              <div className="tile__price"><Rupees value={o.total} /></div>
            </button>
          ))
        )}
      </div>
    </>
  )
}

export function TrackOrder() {
  const { orderId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.order(orderId!), [orderId])

  if (loading) return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><Loading /></div></>
  if (!data) return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><EmptyState title="—" /></div></>

  const order = data.order

  return (
    <>
      <AppBar title={`${t('ord.order')} ${order.id}`} onBack={() => nav(-1)} />
      <div className="screen stack">
        <Card style={{ textAlign: 'center' }}>
          <div className="small dim">{t('cus.yourOtp')}</div>
          <div className="num" style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '0.1em' }}>
            {order.deliveryOtp}
          </div>
          <p className="small muted">{t('cus.otpInstruction')}</p>
        </Card>

        <Card><Timeline order={order} /></Card>

        <Card>
          <div className="stack-sm">
            {order.items.map((i) => (
              <div key={i.productId} className="row-between">
                <div className="row">
                  <span aria-hidden="true">{i.emoji}</span>
                  <span>{i.name} × {i.qty}</span>
                </div>
                <Rupees value={i.price * i.qty} />
              </div>
            ))}
            <hr className="divider" style={{ margin: 'var(--s2) 0' }} />
            <div className="row-between">
              <strong>{t('ord.total')}</strong>
              <strong><Rupees value={order.total} /></strong>
            </div>
            <Pill tone={order.paymentStatus === 'UPI_CONFIRMED' ? 'ok' : 'neutral'}>
              {order.paymentMode === 'COD' ? t('ord.paymentCod') : t('ord.paymentUpi')}
            </Pill>
          </div>
        </Card>
      </div>
    </>
  )
}

export function CustomerProfile() {
  const t = useT()
  const nav = useNavigate()
  const { lang, setLang, langs } = useI18n()
  const { session, signOut } = useAuth()
  const [data] = useAsync(() => api.addresses(), [])

  return (
    <>
      <AppBar title={t('prof.title')} />
      <div className="screen stack">
        <Card>
          <div className="row">
            <div className="tile__img" style={{ width: 56, height: 56, fontSize: '1.75rem' }}>👤</div>
            <div>
              <div style={{ fontWeight: 700 }}>{session?.name ?? 'ग्राहक'}</div>
              <div className="small dim num">+91 {session?.phone}</div>
            </div>
          </div>
        </Card>

        <button className="tile" onClick={() => nav('/shop/orders')}>
          <div className="tile__img" aria-hidden="true">🧾</div>
          <div className="tile__body"><div className="tile__title">{t('cus.myOrders')}</div></div>
          <span aria-hidden="true">›</span>
        </button>

        <Card>
          <SectionTitle>{t('cus.chooseAddress')}</SectionTitle>
          <div className="stack-sm small">
            {(data?.addresses ?? []).map((a) => (
              <div key={a.id}>
                <strong>{a.label}</strong>
                <div className="dim">{a.line}, {a.city} - {a.pincode}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.language')}</SectionTitle>
          <div className="stack-sm">
            {langs.map((l) => (
              <Choice key={l.code} selected={lang === l.code} onSelect={() => setLang(l.code)} title={l.label} />
            ))}
          </div>
        </Card>

        <Button variant="ghost" onClick={() => { signOut(); nav('/', { replace: true }) }}>
          {t('prof.logout')}
        </Button>
      </div>
    </>
  )
}
