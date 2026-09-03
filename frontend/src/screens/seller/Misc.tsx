import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BAND_LABEL } from '@shared/readiness.js'
import { slotInfo } from '@shared/seller.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api } from '../../lib/api.js'
import {
  AppBar, AudioHelpButton, Button, Card, Choice, ConfirmSheet, EmptyState,
  Loading, Notice, Pill, Rupees, SectionTitle, SlotMeter, useAsync,
} from '../../components/ui.js'

/* ================================================================== */
/* Profile                                                             */
/* ================================================================== */

export function SellerProfile() {
  const t = useT()
  const nav = useNavigate()
  const { lang, setLang, langs } = useI18n()
  const { signOut } = useAuth()

  const [me, loading] = useAsync(() => api.me(), [])
  const [productData] = useAsync(() => api.myProducts(), [])
  const [logoutOpen, setLogoutOpen] = useState(false)

  if (loading || !me) {
    return <><AppBar title={t('prof.title')} /><div className="screen"><Loading /></div></>
  }

  const seller = me.seller
  const slots = slotInfo(seller, productData?.products ?? [])

  return (
    <>
      <AppBar title={t('prof.title')} />
      <div className="screen stack">
        <Card>
          <div className="row">
            <div className="tile__img" style={{ width: 64, height: 64, fontSize: '2rem' }}>
              {seller.photo}
            </div>
            <div className="grow">
              <div style={{ fontWeight: 700, fontSize: 'var(--t-md)' }}>{seller.name}</div>
              <div className="small dim">{seller.shopName}</div>
              <div className="small dim num">+91 {seller.phone}</div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--s3)' }}>
            <Notice tone="ok">
              <span className="small dim">{t('reg.yourId')}</span>
              <div className="num" style={{ fontWeight: 800, fontSize: 'var(--t-md)' }}>
                {seller.womenBizId}
              </div>
            </Notice>
          </div>
        </Card>

        {/* Digital Readiness Index - measured, not just self-reported. */}
        <Card>
          <div className="row-between">
            <div>
              <div className="small dim">{t('prof.readiness')}</div>
              <strong style={{ fontSize: 'var(--t-lg)' }}>{seller.readinessScore} / 100</strong>
            </div>
            <Pill tone="info">
              {lang === 'mr' ? BAND_LABEL[seller.readinessBand].mr : BAND_LABEL[seller.readinessBand].en}
            </Pill>
          </div>
          <div
            style={{
              height: 10, borderRadius: 5, background: 'var(--surface-2)',
              border: '1px solid var(--line)', marginTop: 'var(--s3)', overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${seller.readinessScore}%`, height: '100%',
                background: 'var(--series4)',
              }}
            />
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.subscription')}</SectionTitle>
          <SlotMeter
            used={slots.used}
            total={slots.total}
            hint={t('prof.slotsHave', { total: slots.total, used: slots.used })}
          />
          <div style={{ marginTop: 'var(--s3)' }}>
            <Button size="sm" onClick={() => nav('/seller/subscription')}>
              ➕ {t('prof.buyMore')}
            </Button>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.payment')}</SectionTitle>
          <div className="stack-sm">
            <Notice tone="warn">{t('reg.upiHint')}</Notice>
            <div className="row-between">
              <div>
                <div className="small dim">{t('pay.upiId')}</div>
                <strong className="num">{seller.upiId}</strong>
              </div>
              <Pill tone={seller.upiVerified ? 'ok' : 'warn'} icon={seller.upiVerified ? '✓' : '⏳'}>
                {seller.upiVerified ? t('prof.verified') : t('prof.notVerified')}
              </Pill>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.business')}</SectionTitle>
          <div className="stack-sm small">
            <Row label={t('reg.shopName')} value={seller.shopName} />
            <Row label={t('reg.village')} value={`${seller.village} (${seller.villageCode})`} />
            <Row label={t('reg.taluka')} value={seller.taluka} />
            <Row label={t('reg.district')} value={seller.district} />
            <Row label={t('reg.pincode')} value={seller.pincode} />
            {seller.age && <Row label={t('reg.age')} value={String(seller.age)} />}
            {seller.yearsInBusiness != null && (
              <Row label={t('reg.years')} value={`${seller.yearsInBusiness} ${t('reg.yearsUnit')}`} />
            )}
            {seller.monthlyCapacity != null && (
              <Row label={t('reg.capacity')} value={String(seller.monthlyCapacity)} />
            )}
            {seller.shgName && <Row label={t('reg.shgName')} value={seller.shgName} />}
            {seller.sellsFood && (
              <>
                <Row label={t('prod.fssai')} value={seller.fssai ?? '—'} />
                <Row label={t('prod.fssaiExpiry')} value={seller.fssaiExpiry ?? '—'} />
              </>
            )}
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

        <Button variant="ghost" onClick={() => setLogoutOpen(true)}>{t('prof.logout')}</Button>
      </div>

      <ConfirmSheet
        open={logoutOpen}
        title={t('prof.logout')}
        body={t('prof.logoutConfirm')}
        confirmLabel={t('prof.logout')}
        tone="danger"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => { signOut(); nav('/', { replace: true }) }}
      />
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row-between">
      <span className="dim">{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )
}

/* ================================================================== */
/* Help & Training                                                     */
/* ================================================================== */

const TRAINING = [
  { id: 't1', icon: '📱', mr: 'ॲप कसे वापरायचे', en: 'How to use the app', mins: 3 },
  { id: 't2', icon: '💰', mr: '50 रुपये कसे भरायचे', en: 'How to pay the 50 rupees', mins: 2 },
  { id: 't3', icon: '📸', mr: 'फोनने चांगला फोटो कसा काढायचा', en: 'Taking good photos', mins: 4 },
  { id: 't4', icon: '🎤', mr: 'बोलून नाव कसे टाकायचे', en: 'Using voice typing', mins: 2 },
  { id: 't5', icon: '📦', mr: 'ऑर्डर आल्यावर काय करायचे', en: 'When an order arrives', mins: 5 },
  { id: 't6', icon: '🛵', mr: 'पोहोचवताना OTP कसा घ्यायचा', en: 'Taking the OTP at delivery', mins: 2 },
  { id: 't7', icon: '🏦', mr: 'पैसे आले का ते कसे तपासायचे', en: 'Checking the money arrived', mins: 3 },
  { id: 't8', icon: '📜', mr: 'FSSAI परवाना कसा काढायचा', en: 'How to apply for FSSAI', mins: 6 },
  { id: 't9', icon: '💡', mr: 'किंमत कशी ठरवायची', en: 'How to price your product', mins: 5 },
]

export function SellerHelp() {
  const t = useT()
  const { lang } = useI18n()

  return (
    <>
      <AppBar title={t('help.title')} />
      <div className="screen stack">
        <Card>
          <SectionTitle>{t('help.contact')}</SectionTitle>
          <div className="stack-sm">
            <a className="btn btn--ghost" href="https://wa.me/919000000000" target="_blank" rel="noreferrer">
              💬 {t('help.whatsapp')}
            </a>
            <a className="btn btn--ghost" href="tel:+919000000000">📞 {t('help.call')}</a>
            <Button variant="quiet">📝 {t('help.complaint')}</Button>
          </div>
        </Card>

        <div>
          <SectionTitle>{t('help.videos')}</SectionTitle>
          <p className="small dim" style={{ marginTop: -4, marginBottom: 'var(--s2)' }}>
            {t('help.videosSub')}
          </p>
          <div className="stack-sm">
            {TRAINING.map((v) => (
              <button key={v.id} className="tile">
                <div className="tile__img" aria-hidden="true">{v.icon}</div>
                <div className="tile__body">
                  <div className="tile__title">{lang === 'mr' ? v.mr : v.en}</div>
                  <div className="tile__meta">▶ {v.mins} {t('help.minutes')}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <Card>
          <SectionTitle>{t('help.faq')}</SectionTitle>
          <div className="stack-sm small">
            <div>• मी ₹50 भरले पण मंजूर झाले नाही</div>
            <div>• पैसे कधी मिळतील?</div>
            <div>• FSSAI परवाना कसा काढायचा?</div>
            <div>• ऑर्डर आल्यावर काय करायचे?</div>
          </div>
        </Card>
      </div>
    </>
  )
}

/* ================================================================== */
/* My Growth - her own past is the only benchmark, never a leaderboard */
/* ================================================================== */

export function SellerGrowth() {
  const t = useT()
  const { lang } = useI18n()
  const { session } = useAuth()
  const [data, loading] = useAsync(
    () => api.sellerWeek(session?.sellerId ?? ''),
    [session?.sellerId],
  )

  if (loading) {
    return <><AppBar title={t('grow.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }

  const week = data?.week

  // Below 5 orders a chart looks broken and reads as failure. Show nothing.
  if (!week || week.ordersThisWeek < 5) {
    return (
      <>
        <AppBar title={t('grow.title')} backTo="/seller" />
        <div className="screen">
          <Card>
            <EmptyState icon="🌱" title={t('grow.needMoreData')} body={t('grow.needMoreDataSub')} />
          </Card>
        </div>
      </>
    )
  }

  const total = week.days.reduce((n, d) => n + d.v, 0)
  const max = Math.max(...week.days.map((d) => d.v), 1)
  const diff = total - week.lastWeekTotal
  const up = diff >= 0

  const spoken = `${t('grow.earnWeek')} ${total} ${t('common.rupees')}. ${t('grow.vsLastWeek')} ${Math.abs(diff)} ${t('common.rupees')} ${up ? t('grow.more') : t('grow.less')}.`

  return (
    <>
      <AppBar title={t('grow.title')} backTo="/seller" right={<AudioHelpButton text={spoken} />} />
      <div className="screen stack">
        {/* The number first, the chart second. */}
        <Card>
          <div className="section-title">{t('grow.earnWeek')}</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}>
            <span className="hero-num"><Rupees value={total} /></span>
            <span style={{ color: up ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }}>
              {up ? '▲' : '▼'} ₹{Math.abs(diff)} {up ? t('grow.more') : t('grow.less')}
            </span>
          </div>

          {/* No axis, no gridlines, no legend. Every bar carries its value. */}
          <div
            className="bars"
            style={{ gridTemplateColumns: `repeat(${week.days.length}, 1fr)`, marginTop: 'var(--s4)' }}
          >
            {week.days.map((d) => (
              <div className="bars__col" key={d.dEn}>
                <span className={`bars__v ${d.v === 0 ? 'bars__v--zero' : ''}`}>₹{d.v}</span>
                <div
                  className={`bars__bar ${d.v === 0 ? 'bars__bar--zero' : ''}`}
                  style={{ height: d.v === 0 ? 3 : `${Math.round((d.v / max) * 100)}%` }}
                />
                <span className="bars__d">{lang === 'mr' ? d.d : d.dEn}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="row" style={{ gap: 'var(--s3)' }}>
          <Card className="grow">
            <div className="small dim">{t('grow.ordersWeek')}</div>
            <div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{week.ordersThisWeek}</div>
            <div className="small dim">{t('grow.vsLastWeek')} {week.ordersLastWeek}</div>
          </Card>
          <Card className="grow">
            <div className="small dim">{t('grow.repeatCustomers')}</div>
            <div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{week.repeatCustomers}</div>
          </Card>
        </div>

        {/* Two numbers, not a chart. */}
        <Card>
          <div className="section-title">{t('grow.viewsToOrders')}</div>
          <div className="row-between">
            <div>
              <div className="hero-num num" style={{ fontSize: 'var(--t-lg)' }}>{week.views}</div>
              <div className="small dim">{t('grow.peopleSaw', { n: week.views })}</div>
            </div>
            <span style={{ fontSize: '1.5rem' }} aria-hidden="true">→</span>
            <div style={{ textAlign: 'right' }}>
              <div className="hero-num num" style={{ fontSize: 'var(--t-lg)' }}>{week.ordered}</div>
              <div className="small dim">{t('grow.peopleOrdered', { n: week.ordered })}</div>
            </div>
          </div>
        </Card>

        <Button variant="ghost">📤 {t('grow.shareMonth')}</Button>
      </div>
    </>
  )
}

/* ================================================================== */
/* My QR - the shareable poster                                        */
/* ================================================================== */

export function SellerQr() {
  const t = useT()
  const [me, loading] = useAsync(() => api.me(), [])

  if (loading || !me) {
    return <><AppBar title={t('qr.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }

  const seller = me.seller

  // Her link lives on our own domain, never a vendor's. Android App Links open
  // it in the app; if the app is not installed, the Play Store URL carries
  // ?referrer=shop=<slug> and the Install Referrer API routes to her shop on
  // first launch. Do NOT use Firebase Dynamic Links - shut down Aug 2025.
  const shareUrl = `https://shantamahilabazar.in/s/${seller.shopSlug}`

  return (
    <>
      <AppBar title={t('qr.title')} backTo="/seller" />
      <div className="screen stack">
        <p className="muted">{t('qr.sub')}</p>

        {/* The poster, not a bare QR - her photo, name and ID go on it. */}
        <Card style={{ textAlign: 'center' }}>
          <div className="stack-sm">
            <div style={{ fontSize: '2.5rem' }} aria-hidden="true">{seller.photo}</div>
            <strong style={{ fontSize: 'var(--t-md)' }}>{seller.shopName}</strong>
            <div className="tiny num dim">{seller.womenBizId}</div>
            <div
              style={{
                aspectRatio: 1, maxWidth: 190, margin: '0 auto',
                background: 'var(--surface-2)', border: '1px solid var(--line)',
                borderRadius: 'var(--r)', display: 'grid', placeItems: 'center',
                fontSize: '3.5rem',
              }}
            >
              🔳
            </div>
            <div className="small" style={{ fontWeight: 600 }}>स्कॅन करा आणि ऑर्डर करा</div>
            <div className="tiny dim" style={{ wordBreak: 'break-all' }}>{shareUrl}</div>
          </div>
        </Card>

        <div className="btn-row">
          <Button
            onClick={() =>
              window.open(`https://wa.me/?text=${encodeURIComponent(`${seller.shopName}\n${shareUrl}`)}`)
            }
          >
            💬 {t('qr.shareWhatsapp')}
          </Button>
          <Button variant="ghost">⬇ {t('qr.download')}</Button>
        </div>

        <div className="row" style={{ gap: 'var(--s3)' }}>
          <Card className="grow">
            <div className="small dim">{t('qr.scans')}</div>
            <div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{seller.qrScans}</div>
          </Card>
          <Card className="grow">
            <div className="small dim">{t('qr.orders')}</div>
            <div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{seller.qrOrders}</div>
          </Card>
        </div>
      </div>
    </>
  )
}
