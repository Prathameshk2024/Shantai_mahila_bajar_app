import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BAND_LABEL } from '@shared/readiness.js'
import { slotInfo } from '@shared/seller.js'
import type { Seller } from '@shared/types.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, Button, Card, Choice, ConfirmSheet, EmptyState, Field, Loading,
  Notice, Pill, Rupees, SectionTitle, SlotMeter, TextInput, useAsync,
} from '../../components/ui.js'

export function SellerProfile() {
  const t = useT()
  const nav = useNavigate()
  const { lang, setLang, langs } = useI18n()
  const { signOut } = useAuth()
  const [me, loading, setMe] = useAsync(() => api.me(), [])
  const [productData] = useAsync(() => api.myProducts(), [])
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Seller>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [upiCopied, setUpiCopied] = useState(false)

  if (loading || !me) return <><AppBar title={t('prof.title')} /><div className="screen"><Loading /></div></>

  const seller = me.seller
  const slots = slotInfo(seller, productData?.products ?? [])
  const value = <K extends keyof Seller>(key: K) => String(draft[key] ?? seller[key] ?? '')
  const set = <K extends keyof Seller>(key: K, next: Seller[K]) => setDraft((d) => ({ ...d, [key]: next }))

  function startEdit() {
    setDraft({ ...seller })
    setError('')
    setEditing(true)
  }

  async function saveProfile() {
    setSaving(true)
    setError('')
    try {
      const res = await api.updateMe(draft)
      setMe({ ...me!, seller: res.seller })
      setEditing(false)
    } catch (e) {
      setError(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Profile update failed')
    } finally {
      setSaving(false)
    }
  }

  async function copyUpi() {
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(seller.upiId)
        ok = true
      }
    } catch { /* fall through to legacy copy */ }
    if (!ok) {
      const input = document.createElement('textarea')
      input.value = seller.upiId
      input.style.position = 'fixed'
      input.style.left = '-9999px'
      document.body.appendChild(input)
      input.select()
      try { ok = document.execCommand('copy') } catch { ok = false }
      input.remove()
    }
    setUpiCopied(ok)
    window.setTimeout(() => setUpiCopied(false), 1800)
  }

  return (
    <>
      <AppBar title={t('prof.title')} />
      <div className="screen stack">
        <Card>
          <div className="row">
            <div className="tile__img" style={{ width: 64, height: 64, fontSize: '2rem' }}>{seller.photo}</div>
            <div className="grow">
              <div style={{ fontWeight: 700, fontSize: 'var(--t-md)' }}>{seller.name}</div>
              <div className="small dim">{seller.shopName}</div>
              <div className="small dim num">+91 {seller.phone}</div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--s3)' }}><Notice tone="ok"><span className="small dim">{t('reg.yourId')}</span><div className="num" style={{ fontWeight: 800, fontSize: 'var(--t-md)' }}>{seller.womenBizId}</div></Notice></div>
          {!editing && <Button size="sm" onClick={startEdit}>✏️ माहिती संपादित करा</Button>}
        </Card>

        {editing && (
          <Card>
            <SectionTitle>माहिती संपादित करा</SectionTitle>
            <div className="stack-sm">
              {error && <Notice tone="danger">{error}</Notice>}
              <Field label={t('reg.name')} required><TextInput value={value('name')} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label={t('reg.whatsapp')}><TextInput inputMode="tel" value={value('whatsapp')} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
              <Field label={t('reg.age')}><TextInput inputMode="numeric" value={value('age')} onChange={(e) => set('age', e.target.value ? Number(e.target.value) : undefined)} /></Field>
              <Field label={t('reg.education')}><TextInput value={value('education')} onChange={(e) => set('education', e.target.value)} /></Field>
              <Field label={t('reg.shopName')} required><TextInput value={value('shopName')} onChange={(e) => set('shopName', e.target.value)} /></Field>
              <Field label={t('reg.village')} required><TextInput value={value('village')} onChange={(e) => set('village', e.target.value)} /></Field>
              <Field label={t('reg.taluka')}><TextInput value={value('taluka')} onChange={(e) => set('taluka', e.target.value)} /></Field>
              <Field label={t('reg.district')}><TextInput value={value('district')} onChange={(e) => set('district', e.target.value)} /></Field>
              <Field label={t('reg.pincode')} required><TextInput inputMode="numeric" value={value('pincode')} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
              <Field label={t('reg.about')}><TextInput value={value('about')} onChange={(e) => set('about', e.target.value)} /></Field>
              <Field label={t('reg.shgName')}><TextInput value={value('shgName')} onChange={(e) => set('shgName', e.target.value)} /></Field>
              <Field label={t('reg.years')}><TextInput inputMode="numeric" value={value('yearsInBusiness')} onChange={(e) => set('yearsInBusiness', e.target.value ? Number(e.target.value) : undefined)} /></Field>
              <Field label={t('reg.capacity')}><TextInput inputMode="numeric" value={value('monthlyCapacity')} onChange={(e) => set('monthlyCapacity', e.target.value ? Number(e.target.value) : undefined)} /></Field>
              <Field label={t('pay.upiId')} required><TextInput value={value('upiId')} onChange={(e) => set('upiId', e.target.value)} /></Field>
              <Field label={t('prod.fssai')}><TextInput value={value('fssai')} onChange={(e) => set('fssai', e.target.value)} /></Field>
              <Field label={t('prod.fssaiExpiry')}><TextInput type="date" value={value('fssaiExpiry')} onChange={(e) => set('fssaiExpiry', e.target.value)} /></Field>
              <Field label={t('reg.deliveryFee')}><TextInput inputMode="decimal" value={value('deliveryFee')} onChange={(e) => set('deliveryFee', Number(e.target.value || 0))} /></Field>
              <Field label={t('reg.minOrder')}><TextInput inputMode="decimal" value={value('minOrder')} onChange={(e) => set('minOrder', Number(e.target.value || 0))} /></Field>
              <Choice selected={draft.sellsFood ?? seller.sellsFood} onSelect={() => set('sellsFood', !(draft.sellsFood ?? seller.sellsFood))} title="मी खाद्यपदार्थ विकते" />
              <Choice selected={draft.isOpen ?? seller.isOpen} onSelect={() => set('isOpen', !(draft.isOpen ?? seller.isOpen))} title={t('biz.shopOpen')} />
              <div className="btn-row"><Button onClick={() => void saveProfile()} disabled={saving}>{saving ? t('common.loading') : 'जतन करा'}</Button><Button variant="quiet" onClick={() => setEditing(false)}>रद्द करा</Button></div>
            </div>
          </Card>
        )}

        <Card><div className="row-between"><div><div className="small dim">{t('prof.readiness')}</div><strong style={{ fontSize: 'var(--t-lg)' }}>{seller.readinessScore} / 100</strong></div><Pill tone="info">{lang === 'mr' ? BAND_LABEL[seller.readinessBand].mr : BAND_LABEL[seller.readinessBand].en}</Pill></div></Card>

        <Card>
          <SectionTitle>{t('prof.subscription')}</SectionTitle>
          <SlotMeter used={slots.used} total={slots.total} hint={t('prof.slotsHave', { total: slots.total, used: slots.used })} />
          {slots.isFull && <div style={{ marginTop: 'var(--s3)' }}><Button size="sm" onClick={() => nav('/seller/subscription')}>➕ {t('biz.addSlots')}</Button></div>}
        </Card>

        <Card>
          <SectionTitle>{t('prof.payment')}</SectionTitle>
          <div className="row-between">
            <div><div className="small dim">{t('pay.upiId')}</div><strong className="num">{seller.upiId}</strong></div>
            <Button variant="quiet" size="sm" onClick={() => void copyUpi()}>{upiCopied ? '✓ UPI ID copied' : 'Copy UPI ID'}</Button>
          </div>
          {upiCopied && <div className="small" style={{ marginTop: 6 }}>UPI ID copied.</div>}
          <div style={{ marginTop: 8 }}><Pill tone={seller.upiVerified ? 'ok' : 'warn'} icon={seller.upiVerified ? '✓' : '⏳'}>{seller.upiVerified ? t('prof.verified') : t('prof.notVerified')}</Pill></div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.business')}</SectionTitle>
          <div className="stack-sm small">
            <Row label={t('reg.shopName')} value={seller.shopName} />
            <Row label={t('reg.village')} value={`${seller.village} (${seller.villageCode})`} />
            <Row label={t('reg.taluka')} value={seller.taluka} />
            <Row label={t('reg.district')} value={seller.district} />
            <Row label={t('reg.pincode')} value={seller.pincode} />
            {seller.age != null && <Row label={t('reg.age')} value={String(seller.age)} />}
            {seller.yearsInBusiness != null && <Row label={t('reg.years')} value={`${seller.yearsInBusiness} ${t('reg.yearsUnit')}`} />}
            {seller.monthlyCapacity != null && <Row label={t('reg.capacity')} value={String(seller.monthlyCapacity)} />}
            {seller.shgName && <Row label={t('reg.shgName')} value={seller.shgName} />}
            {seller.about && <Row label={t('reg.about')} value={seller.about} />}
            {seller.sellsFood && <><Row label={t('prod.fssai')} value={seller.fssai ?? '—'} /><Row label={t('prod.fssaiExpiry')} value={seller.fssaiExpiry ?? '—'} /></>}
          </div>
        </Card>

        <Card><SectionTitle>{t('prof.language')}</SectionTitle><div className="stack-sm">{langs.map((l) => <Choice key={l.code} selected={lang === l.code} onSelect={() => setLang(l.code)} title={l.label} />)}</div></Card>
        <Button variant="ghost" onClick={() => setLogoutOpen(true)}>{t('prof.logout')}</Button>
      </div>
      <ConfirmSheet open={logoutOpen} title={t('prof.logout')} body={t('prof.logoutConfirm')} confirmLabel={t('prof.logout')} tone="danger" onCancel={() => setLogoutOpen(false)} onConfirm={() => { signOut(); nav('/', { replace: true }) }} />
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="row-between"><span className="dim">{label}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span></div>
}

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
  return <><AppBar title={t('help.title')} /><div className="screen stack"><Card><SectionTitle>{t('help.contact')}</SectionTitle><div className="stack-sm"><a className="btn btn--ghost" href="https://wa.me/919000000000" target="_blank" rel="noreferrer">💬 {t('help.whatsapp')}</a><a className="btn btn--ghost" href="tel:+919000000000">📞 {t('help.call')}</a></div></Card><div><SectionTitle>{t('help.videos')}</SectionTitle><p className="small dim" style={{ marginTop: -4, marginBottom: 'var(--s2)' }}>{t('help.videosSub')}</p><div className="stack-sm">{TRAINING.map((v) => <button key={v.id} className="tile"><div className="tile__img" aria-hidden="true">{v.icon}</div><div className="tile__body"><div className="tile__title">{lang === 'mr' ? v.mr : v.en}</div><div className="tile__meta">▶ {v.mins} {t('help.minutes')}</div></div></button>)}</div></div><Card><SectionTitle>{t('help.faq')}</SectionTitle><div className="stack-sm small"><div>• मी ₹50 भरले पण मंजूर झाले नाही</div><div>• पैसे कधी मिळतील?</div><div>• FSSAI परवाना कसा काढायचा?</div><div>• ऑर्डर आल्यावर काय करायचे?</div></div></Card></div></>
}

export function SellerGrowth() {
  const t = useT()
  const { lang } = useI18n()
  const { session } = useAuth()
  const [data, loading] = useAsync(() => api.sellerWeek(session?.sellerId ?? ''), [session?.sellerId])
  if (loading) return <><AppBar title={t('grow.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  const week = data?.week
  if (!week || week.ordersThisWeek < 5) return <><AppBar title={t('grow.title')} backTo="/seller" /><div className="screen"><Card><EmptyState icon="🌱" title={t('grow.needMoreData')} body={t('grow.needMoreDataSub')} /></Card></div></>
  const total = week.days.reduce((n, d) => n + d.v, 0)
  const max = Math.max(...week.days.map((d) => d.v), 1)
  const diff = total - week.lastWeekTotal
  const up = diff >= 0
  return <><AppBar title={t('grow.title')} backTo="/seller" /><div className="screen stack"><Card><div className="section-title">{t('grow.earnWeek')}</div><div className="row" style={{ alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}><span className="hero-num"><Rupees value={total} /></span><span style={{ color: up ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }}>{up ? '▲' : '▼'} ₹{Math.abs(diff)} {up ? t('grow.more') : t('grow.less')}</span></div><div className="bars" style={{ gridTemplateColumns: `repeat(${week.days.length}, 1fr)`, marginTop: 'var(--s4)' }}>{week.days.map((d) => <div className="bars__col" key={d.dEn}><span className={`bars__v ${d.v === 0 ? 'bars__v--zero' : ''}`}>₹{d.v}</span><div className={`bars__bar ${d.v === 0 ? 'bars__bar--zero' : ''}`} style={{ height: d.v === 0 ? 3 : `${Math.round((d.v / max) * 100)}%` }} /><span className="bars__d">{lang === 'mr' ? d.d : d.dEn}</span></div>)}</div></Card><div className="row" style={{ gap: 'var(--s3)' }}><Card className="grow"><div className="small dim">{t('grow.ordersWeek')}</div><div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{week.ordersThisWeek}</div><div className="small dim">{t('grow.vsLastWeek')} {week.ordersLastWeek}</div></Card><Card className="grow"><div className="small dim">{t('grow.repeatCustomers')}</div><div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{week.repeatCustomers}</div></Card></div><Card><div className="section-title">{t('grow.viewsToOrders')}</div><div className="row-between"><div><div className="hero-num num" style={{ fontSize: 'var(--t-lg)' }}>{week.views}</div><div className="small dim">{t('grow.peopleSaw', { n: week.views })}</div></div><span style={{ fontSize: '1.5rem' }} aria-hidden="true">→</span><div style={{ textAlign: 'right' }}><div className="hero-num num" style={{ fontSize: 'var(--t-lg)' }}>{week.ordered}</div><div className="small dim">{t('grow.peopleOrdered', { n: week.ordered })}</div></div></div></Card></div></>
}
