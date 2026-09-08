import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, Button, Card, Field, Loading, Notice, Rupees, TextInput, useAsync,
} from '../../components/ui.js'

export function Subscription() {
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.subscription(), [])
  const [utr, setUtr] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading || !data) {
    return <><AppBar title={t('pay.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }

  const { account, plan, slots, status, payments } = data
  const latestPending = payments.find((p) => p.status === 'PENDING')
  const latestRejected = payments.find((p) => p.status === 'REJECTED')
  const canPay = !latestPending && (
    status === 'REGISTERED' ||
    status === 'PAYMENT_REJECTED' ||
    (status === 'ACTIVE' && slots.isFull)
  )
  const isAddon = status === 'ACTIVE' && slots.isFull

  async function submit() {
    if (utr.trim().length < 6) {
      setErr(t('pay.utrHint'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      await api.submitPayment(utr.trim())
      nav('/seller/waiting', { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  const upiLink =
    `upi://pay?pa=${account.upiId}&pn=${encodeURIComponent(account.label)}` +
    `&am=${plan.price}.00&cu=INR&tn=Shanta Mahila Bazar%20${isAddon ? 'additional%20product%20slots' : 'registration'}`

  return (
    <>
      <AppBar title={t('pay.title')} backTo="/seller" />
      <div className="screen stack">
        {latestPending && (
          <Notice tone="info" title="पेमेंट तपासले जात आहे">
            तुमचे पेमेंट आधीच पाठवले आहे. पुन्हा Pay Now किंवा नवीन नोंदणी करू नका. प्रशासकाच्या पडताळणीची वाट पहा.
          </Notice>
        )}

        {status === 'ACTIVE' && !slots.isFull && !latestPending && (
          <Notice tone="ok">
            तुमच्या सध्याच्या उत्पादनाच्या जागा उपलब्ध आहेत. सर्व जागा भरल्यानंतरच अतिरिक्त स्लॉटसाठी पेमेंट करा.
          </Notice>
        )}

        {latestRejected && !latestPending && (
          <Notice tone="danger" title="पेमेंट नाकारले">
            {latestRejected.rejectReason ?? 'पेमेंट पडताळता आले नाही. कृपया योग्य UTR सह पुन्हा सबमिट करा.'}
          </Notice>
        )}

        <Card style={{ textAlign: 'center' }}>
          <div className="hero-num"><Rupees value={plan.price} /></div>
          <p className="muted" style={{ marginTop: 'var(--s2)' }}>
            {isAddon ? 'अतिरिक्त उत्पादन स्लॉटसाठी पेमेंट' : t('pay.what')}
          </p>
        </Card>

        {canPay && (
          <>
            <Card>
              <div className="section-title">{t('pay.payTo')}</div>
              <div className="stack-sm">
                <div
                  style={{
                    aspectRatio: 1, maxWidth: 200, margin: '0 auto',
                    background: 'var(--surface-2)', borderRadius: 'var(--r)',
                    display: 'grid', placeItems: 'center', fontSize: '3rem',
                    border: '1px solid var(--line)',
                  }}
                  aria-label={t('pay.scanQr')}
                >
                  🔳
                </div>
                <div className="center">
                  <div className="small dim">{t('pay.upiId')}</div>
                  <strong className="num">{account.upiId}</strong>
                </div>
                <a className="btn" href={upiLink}>{t('cus.payNow')} · ₹{plan.price}</a>
                <div className="small dim center">{account.bankName} · A/C {account.accountNo} · {account.ifsc}</div>
              </div>
            </Card>

            <Card>
              <div className="section-title">{t('pay.afterPaying')}</div>
              <div className="stack">
                <Field label={t('pay.utr')} hint={t('pay.utrHint')} error={err} required htmlFor="utr">
                  <TextInput
                    id="utr"
                    inputMode="numeric"
                    value={utr}
                    error={!!err}
                    onChange={(e) => { setUtr(e.target.value.replace(/\s/g, '')); setErr('') }}
                    placeholder="512309887711"
                  />
                </Field>
              </div>
            </Card>

            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? t('common.loading') : t('pay.submit')}
            </Button>
          </>
        )}
      </div>
    </>
  )
}

export function PaymentWaiting() {
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.subscription(), [])

  if (loading || !data) return <div className="app-shell"><div className="screen"><Loading /></div></div>

  const latest = data.payments[0]
  const pending = data.payments.find((p) => p.status === 'PENDING')
  const pendingIsAddon = pending?.purpose === 'SLOT_ADDON'

  if (pending) {
    return (
      <div className="app-shell">
        <AppBar title={t('pay.title')} />
        <div className="screen screen--nonav stack">
          <div className="center stack-sm" style={{ paddingTop: 'var(--s5)' }}>
            <div style={{ fontSize: '4rem' }} aria-hidden="true">⏳</div>
            <h1 className="h1">पेमेंट तपासले जात आहे</h1>
            <p className="h3" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
              {pendingIsAddon ? 'अतिरिक्त स्लॉटचे पेमेंट पडताळले जात आहे.' : t('wait.sub')}
            </p>
          </div>
          <Notice tone="info">तुम्ही पुन्हा Pay Now किंवा नवीन नोंदणी करू नका. पडताळणी पूर्ण झाल्यावरच पुढील कृती करा.</Notice>
          <Card>
            <div className="row-between"><span className="dim">{t('pay.utr')}</span><strong className="num">{pending.utr}</strong></div>
            <div className="row-between" style={{ marginTop: 8 }}><span className="dim">{t('pay.title')}</span><strong><Rupees value={pending.amount} /></strong></div>
          </Card>
          <Button variant="quiet" onClick={() => nav('/seller', { replace: true })}>{t('biz.title')}</Button>
        </div>
      </div>
    )
  }

  if (data.status === 'PAYMENT_REJECTED') {
    return (
      <div className="app-shell">
        <AppBar title={t('pay.title')} />
        <div className="screen screen--nonav stack">
          <div className="center stack-sm">
            <div style={{ fontSize: '3.5rem' }} aria-hidden="true">⚠️</div>
            <h1 className="h1">{t('wait.rejected')}</h1>
          </div>
          {latest?.rejectReason && <Notice tone="danger">{latest.rejectReason}</Notice>}
          <Button onClick={() => nav('/seller/subscription')}>{t('wait.resubmit')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="screen screen--nonav stack center" style={{ justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '4rem' }} aria-hidden="true">🎉</div>
        <h1 className="h1">{t('wait.approved')}</h1>
        <p className="muted">{t('wait.approvedSub')}</p>
        <Button onClick={() => nav('/seller', { replace: true })}>{t('biz.title')}</Button>
      </div>
    </div>
  )
}
