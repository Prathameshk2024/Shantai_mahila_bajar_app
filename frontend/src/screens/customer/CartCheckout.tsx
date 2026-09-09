import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Address, Seller } from '@shared/types.js'
import { STATUS_STYLE, statusLabelKey } from '@shared/orderFlow.js'
import { buildUpiLink } from '@shared/seller.js'
import { useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { useCart } from '../../store/CartContext.js'
import { usePincode } from '../../store/PincodeContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import QrCode from '../../components/QrCode.js'
import { Avatar } from '../../components/Avatar.js'
import { AddressForm } from '../../components/AddressForm.js'
import {
  AppBar, Button, Card, Choice, EmptyState, Field, LanguagePicker, Loading, Notice,
  Pill, Rupees, SectionTitle, Stepper, TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import { Timeline } from '../seller/Orders.js'
import {
  IconAddressHome, IconAddressOther, IconCall, IconCart, IconCash, IconChevron,
  IconNext, IconOrders, IconPlus, IconProfile, IconUpi, IconWhatsapp,
} from '../../components/icons.js'
import { PageTour, TourMenu } from '../../components/Walkthrough.js'

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
              icon={IconCart}
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
      <div className="screen stack" data-wt="cart-list">
        {groups.length > 1 && <Notice tone="info">{t('cus.perSellerNote')}</Notice>}

        {groups.map((g) => (
          <Card key={g.sellerId}>
            <div className="row" style={{ marginBottom: 'var(--s3)' }}>
              <Avatar name={g.seller?.shopName ?? g.seller?.name} size={40} />
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
                  ? <span className="pill pill--ok">{t('cart.free')}</span>
                  : <Rupees value={g.deliveryFee} />}
              </div>
              <div className="row-between" style={{ fontSize: 'var(--t-base)' }}>
                <strong>{t('cus.grandTotal')}</strong>
                <strong><Rupees value={g.total} /></strong>
              </div>
            </div>

            {g.belowMinimum && (
              <div style={{ marginTop: 'var(--s3)' }}>
                <Notice tone="warn">{t('cart.minOrder')} <Rupees value={g.minOrder} /></Notice>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="actionbar" data-wt="cart-total">
        <div className="row-between">
          <strong>{t('cus.grandTotal')}</strong>
          <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={grand} /></strong>
        </div>
        <Button data-wt="cart-checkout" disabled={blocked} onClick={() => nav('/shop/checkout')}>
          {t('cus.checkout')} <IconNext aria-hidden="true" />
        </Button>
      </div>

      <PageTour id="shop.cart" />
    </>
  )
}

function dedupeSellers(products: { seller?: Partial<Seller> }[]): Partial<Seller>[] {
  const map = new Map<string, Partial<Seller>>()
  for (const p of products) if (p.seller?.id) map.set(p.seller.id, p.seller)
  return [...map.values()]
}

/**
 * One line of address text. `city` is optional now: an address recovered from
 * an order has a line, a landmark and a pincode, but orders never captured a
 * city, so joining it in unguarded printed "..., undefined - 413601".
 */
function addressLine(a: Address): string {
  return [a.line, a.city].filter(Boolean).join(', ') + ` - ${a.pincode}`
}

/* ================================================================== */
/* Checkout - address, then a payment step PER SELLER                   */
/* ================================================================== */

export function Checkout() {
  const t = useT()
  const nav = useNavigate()
  const { session } = useAuth()
  const { toast } = useToast()
  const { groupBySeller, clear } = useCart()

  const [catalogData, loadingCatalog] = useAsync(() => api.catalog(), [])
  const [customerData, loadingCustomer, setCustomerData] = useAsync(() => api.customerMe(), [])

  const { pincode: savedPincode } = usePincode()
  const [addressId, setAddressId] = useState<string | null>(null)
  const [addingAddress, setAddingAddress] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [mode, setMode] = useState<'COD' | 'UPI'>('COD')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (loadingCatalog || loadingCustomer) {
    return <><AppBar title={t('cus.checkout')} backTo="/shop/cart" /><div className="screen"><Loading /></div></>
  }

  const customer = customerData?.customer
  const addresses: Address[] = customer?.addresses ?? []

  /** Save a newly typed address, then select it so she can carry straight on. */
  async function saveAddress(input: Parameters<typeof api.addAddress>[0]) {
    setSavingAddress(true)
    setErr('')
    try {
      const res = await api.addAddress(input)
      setAddressId(res.address.id)
      setAddingAddress(false)
      setCustomerData(await api.customerMe())
      toast(t('ok.addressSaved'))
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setSavingAddress(false)
    }
  }
  const sellers = dedupeSellers(catalogData?.products ?? [])
  const groups = groupBySeller(sellers)
  const address =
    addresses.find((a) => a.id === addressId) ??
    // She already told us her pincode on Explore - default to the address that
    // matches it rather than making her pick again.
    addresses.find((a) => a.pincode === savedPincode) ??
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
        // Her stored name first: the session falls back to the ग्राहक
        // placeholder, and sending that would overwrite nothing but tell the
        // seller nothing either.
        customerName: customer?.name || session?.name || t('common.customer'),
      })
      clear()
      toast(t('ok.orderPlaced'))
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
          <SectionTitle>
            {addresses.length === 0 ? t('cus.firstAddress') : t('cus.chooseAddress')}
          </SectionTitle>

          {/*
            Her first order has no address to pick, so the form IS the step.
            Before customers had records of their own this screen showed two
            seeded addresses belonging to nobody, and there was no way to enter
            one - an empty picker here would simply block checkout.
          */}
          {addresses.length === 0 || addingAddress ? (
            <Card>
              {addresses.length === 0 && (
                <p className="small dim">{t('cus.firstAddressSub')}</p>
              )}
              <AddressForm
                busy={savingAddress}
                onSubmit={saveAddress}
                onCancel={addresses.length > 0 ? () => setAddingAddress(false) : undefined}
              />
            </Card>
          ) : (
            <div className="stack-sm">
              {addresses.map((a) => (
                <Choice
                  key={a.id}
                  selected={address?.id === a.id}
                  onSelect={() => setAddressId(a.id)}
                  icon={a.label === 'घर' ? <IconAddressHome /> : <IconAddressOther />}
                  title={a.label}
                  sub={addressLine(a)}
                />
              ))}
              <Button variant="ghost" size="sm" onClick={() => setAddingAddress(true)}>
                <IconPlus aria-hidden="true" /> {t('cus.addAddress')}
              </Button>
            </div>
          )}
        </div>

        {unserviceable.length > 0 && (
          <Notice tone="warn">
            {unserviceable.map((g) => g.seller?.shopName).join(', ')} — {t('cus.notServiceable')}
          </Notice>
        )}

        <div>
          <SectionTitle>{t('cus.choosePayment')}</SectionTitle>
          <div className="stack-sm">
            <Choice selected={mode === 'COD'} onSelect={() => setMode('COD')} icon={<IconCash />} title={t('cus.payCod')} />
            <Choice
              selected={mode === 'UPI'}
              onSelect={() => setMode('UPI')}
              icon={<IconUpi />}
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
              // Her own uploaded QR wins over the one this app draws: it is
              // the code printed in her shop, so it is the one she recognises
              // if a buyer ever rings to ask whether the payment reached her.
              const herQr = g.seller?.upiQrUrl
              const ready = (!!g.seller?.upiQrReady || !!herQr) && !!g.seller?.upiId
              const link = buildUpiLink({
                upiId: g.seller?.upiId ?? '',
                name: g.seller?.shopName,
                amount: g.total,
                note: 'Shantai Mahila Bazar order',
              })
              return (
                <Card key={g.sellerId}>
                  <div className="row-between" style={{ marginBottom: 'var(--s3)' }}>
                    <div className="row">
                      <Avatar name={g.seller?.shopName ?? g.seller?.name} size={40} />
                      <div>
                        <div className="small dim">{t('cus.payTo')}</div>
                        <strong>{g.seller?.shopName}</strong>
                      </div>
                    </div>
                    <strong><Rupees value={g.total} /></strong>
                  </div>
                  {ready ? (
                    <>
                      {herQr ? (
                        <img
                          src={herQr}
                          alt={t('cus.payTo')}
                          style={{ width: 170, margin: '0 auto', borderRadius: 'var(--r-sm)' }}
                        />
                      ) : (
                        <QrCode value={link} size={150} label={t('cus.payTo')} />
                      )}
                      <a className="btn" href={link} style={{ marginTop: 'var(--s3)' }}>
                        {t('cus.payNow')} · ₹{g.total}
                      </a>
                      <div className="tiny dim center" style={{ marginTop: 6 }}>{g.seller?.upiId}</div>
                    </>
                  ) : (
                    /* She has not set her payment QR up yet, so there is
                       nothing real to show. Say so instead of drawing a code. */
                    <Notice tone="warn">{t('qrpay.notSetUp')}</Notice>
                  )}
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
              {t('cart.sellerCount', { n: groups.length })}
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

        <Card style={{ textAlign: 'center' }}>
          <p className="body muted" style={{ margin: 0 }}>{t('cus.orderPlacedNote')}</p>
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
          <Card><EmptyState icon={IconOrders} title={t('ord.noOrders')} /></Card>
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
  const seller = data.seller

  return (
    <>
      <AppBar title={`${t('ord.order')} ${order.id}`} onBack={() => nav(-1)} />
      <div className="screen stack">
        <Card><Timeline order={order} /></Card>

        {/* Her number is on the ORDER, never on the catalogue: it appears once
            there is a transaction between them, and only to the person who
            placed it. A buyer waiting on food she has already paid for should
            not have to go through us to ask when it is coming. */}
        {seller && (
          <Card>
            <div className="row">
              <Avatar name={seller.shopName ?? seller.name} size={44} />
              <div className="grow">
                <div className="small dim">{t('cus.fromSeller')}</div>
                <strong>{seller.shopName}</strong>
                {seller.phone && <div className="small dim num">+91 {seller.phone}</div>}
              </div>
            </div>
            {seller.phone && (
              <div className="btn-row" style={{ marginTop: 'var(--s3)' }}>
                <a className="btn btn--ghost" href={`tel:+91${seller.phone}`}>
                  <IconCall aria-hidden="true" /> {t('cus.callSeller')}
                </a>
                <a
                  className="btn btn--ghost"
                  href={`https://wa.me/91${seller.phone}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconWhatsapp aria-hidden="true" /> {t('help.whatsapp')}
                </a>
              </div>
            )}
          </Card>
        )}

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
  const { session, signOut, patchSession } = useAuth()
  const [data, loading, setData] = useAsync(() => api.customerMe(), [])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  const customer = data?.customer
  const addresses = customer?.addresses ?? []

  /** Every mutation re-reads her record, so the list can never drift. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      setData(await api.customerMe())
      setAdding(false)
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar title={t('prof.title')} />
      <div className="screen stack">
        {/* Her name is registration data, not a display string, so it is
            editable here and written back to her customer record. The seller
            reads it on every order she places. */}
        <Card data-wt="cprof-name">
          <div className="row">
            <div className="tile__img" style={{ width: 56, height: 56, fontSize: '1.75rem' }}>
              <IconProfile aria-hidden="true" />
            </div>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>
                {customer?.name || session?.name || t('common.customer')}
              </div>
              <div className="small dim num">+91 {session?.phone}</div>
            </div>
            {nameDraft === null && (
              <button
                type="button"
                className="linkbtn"
                onClick={() => setNameDraft(customer?.name ?? session?.name ?? '')}
              >
                {t('common.edit')}
              </button>
            )}
          </div>

          {nameDraft !== null && (
            <div className="stack-sm" style={{ marginTop: 'var(--s3)' }}>
              <Field label={t('cus.yourName')} hint={t('creg.nameHint')} required>
                <VoiceInput
                  value={nameDraft}
                  onChange={setNameDraft}
                  placeholder={t('ph.fullName')}
                />
              </Field>
              <div className="btn-row">
                <Button variant="quiet" size="sm" onClick={() => setNameDraft(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !nameDraft.trim()}
                  onClick={() => {
                    const name = nameDraft.trim()
                    void run(async () => {
                      const res = await api.updateCustomerMe(name)
                      patchSession({ name: res.customer.name })
                    }).then(() => setNameDraft(null))
                  }}
                >
                  {t('cus.saveName')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <button className="tile" data-wt="cprof-orders" onClick={() => nav('/shop/orders')}>
          <div className="tile__img" aria-hidden="true"><IconOrders /></div>
          <div className="tile__body"><div className="tile__title">{t('cus.myOrders')}</div></div>
          <span aria-hidden="true"><IconChevron /></span>
        </button>

        <Card data-wt="cprof-addr">
          <SectionTitle>{t('cus.savedAddresses')}</SectionTitle>

          {loading && <Loading />}

          {!loading && addresses.length === 0 && !adding && (
            <p className="small dim">{t('cus.noAddresses')}</p>
          )}

          <div className="stack-sm">
            {addresses.map((a) =>
              editing === a.id ? (
                <AddressForm
                  key={a.id}
                  initial={a}
                  busy={busy}
                  submitLabel={t('common.save')}
                  onSubmit={(input) => void run(() => api.updateAddress(a.id, input))}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={a.id} className="stack-sm">
                  <div className="row">
                    <strong>{a.label}</strong>
                    {a.isDefault && <Pill tone="ok">{t('cus.defaultAddress')}</Pill>}
                  </div>
                  <div className="small dim">{addressLine(a)}</div>
                  {a.landmark && <div className="small dim">{a.landmark}</div>}
                  {/* btn-row, not row: these share the width evenly instead of
                      each one sizing to its own label, which is why "Remove"
                      sat wider than "Edit" and the add button below lined up
                      with neither. */}
                  <div className="btn-row">
                    <Button variant="quiet" size="sm" onClick={() => setEditing(a.id)}>
                      {t('common.edit')}
                    </Button>
                    {!a.isDefault && (
                      <Button
                        variant="quiet"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => api.updateAddress(a.id, { isDefault: true }))}
                      >
                        {t('cus.setDefault')}
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(t('cus.deleteAddressConfirm'))) {
                          void run(() => api.deleteAddress(a.id))
                        }
                      }}
                    >
                      {t('cus.deleteAddress')}
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>

          {adding ? (
            <AddressForm
              busy={busy}
              onSubmit={(input) => void run(() => api.addAddress(input))}
              onCancel={() => setAdding(false)}
            />
          ) : (
            /* Full width and on its own row: it acts on the LIST, not on any
               one address, so it must not read as a third button belonging to
               the last card. */
            <Button variant="ghost" onClick={() => setAdding(true)} style={{ marginTop: 'var(--s3)' }}>
              <IconPlus aria-hidden="true" /> {t('cus.addAddress')}
            </Button>
          )}
        </Card>

        {/* Help & Training for the shopper: the same four tabs she has at
            the bottom of the screen, each one replayed on the real page. */}
        <div>
          <SectionTitle>{t('wt.title')}</SectionTitle>
          <p className="small dim" style={{ marginTop: -4, marginBottom: 'var(--s2)' }}>
            {t('wt.sub')}
          </p>
          <TourMenu role="customer" />
        </div>

        <Card>
          <LanguagePicker />
        </Card>

        <Button variant="ghost" onClick={() => { signOut(); nav('/', { replace: true }) }}>
          {t('prof.logout')}
        </Button>
      </div>

      <PageTour id="shop.profile" />
    </>
  )
}
