import { useNavigate } from 'react-router-dom'
import type { Order } from '@shared/types.js'
import { needsSellerAction, STATUS_STYLE, statusLabelKey } from '@shared/orderFlow.js'
import { slotInfo } from '@shared/seller.js'
import { useT } from '../../i18n/I18nProvider.js'
import { api } from '../../lib/api.js'
import {
  AppBar, Button, Card, EmptyState, Loading, Notice, Pill, Rupees, SectionTitle, SlotMeter, useAsync,
} from '../../components/ui.js'

export default function MyBusiness() {
  const t = useT()
  const nav = useNavigate()
  const [me, loadingMe, setMe] = useAsync(() => api.me(), [])
  const [orderData, loadingOrders] = useAsync(() => api.myOrders(), [])
  const [productData, loadingProducts] = useAsync(() => api.myProducts(), [])

  if (loadingMe || loadingOrders || loadingProducts) {
    return <><AppBar title={t('biz.title')} /><div className="screen"><Loading /></div></>
  }
  if (!me) return <><AppBar title={t('biz.title')} /><div className="screen"><EmptyState title="—" /></div></>

  const seller = me.seller
  const orders = orderData?.orders ?? []
  const products = productData?.products ?? []
  const slots = slotInfo(seller, products)
  const actionable = orders.filter(needsSellerAction)
  const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString()
  const todayEarnings = orders
    .filter((o) => isToday(o.events.find((e) => e.to === 'DELIVERED')?.at))
    .reduce((n, o) => n + o.total, 0)
  const todayOrders = orders.filter((o) => isToday(o.placedAt)).length

  async function toggleShop() {
    const res = await api.updateMe({ isOpen: !seller.isOpen })
    setMe({ ...me!, seller: res.seller })
  }

  return (
    <>
      <AppBar title={seller.shopName} sub={`${seller.womenBizId} · ${seller.village}`} />
      <div className="screen stack">
        <Card className={seller.isOpen ? '' : 'notice--warn'}>
          <div className="row-between">
            <div className="stack-sm" style={{ gap: 2 }}>
              <strong>{seller.isOpen ? t('biz.shopOpen') : t('biz.shopClosed')}</strong>
              <span className="small dim">{t('biz.shopOpenHint')}</span>
            </div>
            <Button variant={seller.isOpen ? 'quiet' : 'primary'} size="sm" onClick={toggleShop}>
              {seller.isOpen ? '⏸' : '▶'}
            </Button>
          </div>
        </Card>

        <Card>
          <SlotMeter used={slots.used} total={slots.total} hint={slots.isFull ? t('biz.slotsFull') : t('biz.slotsLeft', { n: slots.left })} />
          {slots.almostFull && <div style={{ marginTop: 'var(--s3)' }}><Notice tone="warn">{t('biz.oneSlotLeft')}</Notice></div>}
          {slots.isFull && (
            <div style={{ marginTop: 'var(--s3)' }}>
              <Button size="sm" onClick={() => nav('/seller/subscription')}>{t('biz.addSlots')}</Button>
            </div>
          )}
        </Card>

        <div className="row" style={{ gap: 'var(--s3)' }}>
          <Card className="grow"><div className="small dim">{t('biz.earnToday')}</div><div className="hero-num" style={{ fontSize: 'var(--t-xl)' }}><Rupees value={todayEarnings} /></div></Card>
          <Card className="grow"><div className="small dim">{t('biz.ordersToday')}</div><div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{todayOrders}</div></Card>
        </div>

        <div>
          <SectionTitle action={<button className="btn btn--quiet btn--sm" onClick={() => nav('/seller/orders')}>{t('common.viewAll')}</button>}>
            {t('biz.needsAction')}
          </SectionTitle>
          {actionable.length === 0 ? (
            <Card><EmptyState icon="✅" title={t('biz.noAction')} body={t('biz.noActionSub')} /></Card>
          ) : (
            <div className="stack-sm">{actionable.map((o) => <ActionRow key={o.id} order={o} onOpen={() => nav(`/seller/orders/${o.id}`)} />)}</div>
          )}
        </div>

        <div className="pgrid pgrid--2">
          <QuickLink icon="📦" label={t('biz.myProducts')} to="/seller/products" />
          <QuickLink icon="🧾" label={t('biz.myOrders')} to="/seller/orders" />
          <QuickLink icon="📈" label={t('biz.myGrowth')} to="/seller/growth" />
        </div>

        {seller.status !== 'ACTIVE' && <Notice tone="warn" title={t('wait.sub')}>{t('wait.canDoMeanwhile')}</Notice>}
      </div>
    </>
  )
}

function QuickLink({ icon, label, to }: { icon: string; label: string; to: string }) {
  const nav = useNavigate()
  return <button className="card card--tap" onClick={() => nav(to)} style={{ textAlign: 'center' }}><div style={{ fontSize: '1.9rem' }} aria-hidden="true">{icon}</div><div style={{ fontWeight: 700, marginTop: 4 }}>{label}</div></button>
}

function ActionRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const t = useT()
  const style = STATUS_STYLE[order.status]
  const awaitingPayment = order.paymentMode === 'UPI' && order.paymentStatus === 'UPI_SUBMITTED'
  const todo = awaitingPayment ? t('ord.paymentPending') : order.status === 'PLACED' ? t('ord.accept') : order.status === 'ACCEPTED' ? t('ord.markPacked') : order.status === 'PACKED' ? t('ord.markOut') : t('ord.markDelivered')
  return (
    <button className="tile" onClick={onOpen}>
      <div className="tile__img" aria-hidden="true">{style.icon}</div>
      <div className="tile__body">
        <div className="tile__title">{todo}</div>
        <div className="tile__meta">{order.id} · {order.customerName}</div>
        <div className="wrap-row" style={{ marginTop: 2 }}>
          <Pill tone={style.tone} icon={style.icon}>{t(statusLabelKey(order.status))}</Pill>
          <Pill tone="neutral">{order.paymentMode === 'COD' ? t('ord.paymentCod') : t('ord.paymentUpi')}</Pill>
        </div>
      </div>
      <div className="tile__price"><Rupees value={order.total} /></div>
    </button>
  )
}
