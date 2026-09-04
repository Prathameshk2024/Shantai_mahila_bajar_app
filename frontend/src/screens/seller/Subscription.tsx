import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import QrCode from '../../components/QrCode.js'
import {
  AppBar, AudioHelpButton, Button, Card, Field, Loading, Notice,
  Rupees, TextInput, useAsync,
} from '../../components/ui.js'

/* ================================================================== */
/* Pay the 50 rupees. She pays the admin account from her own UPI app,  */
/* then types the reference number back in. No gateway.                 */
/* ================================================================== */

export function Subscription() {
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.subscription(), [])

  const [utr, setUtr] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) {
    return <><AppBar title={t('pay.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title={t('pay.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }

  const { account, plan } = data

  async function submit() {
    if (utr.trim().length < 6) {
      setErr(t('pay.utrHint'))
      return
    }
    setBusy(true)
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
    `&am=${plan.price}.00&cu=INR&tn=${encodeURIComponent('Shanta Mahila Bazar')}`

  return (
    <>
      <AppBar
        title={t('pay.title')}
        backTo="/seller"
        right={<AudioHelpButton text={`${t('pay.amount')}. ${t('pay.what')}`} />}
      />
      <div className="screen stack">
        <Card style={{ textAlign: 'center' }}>
          <div className="hero-num"><Rupees value={plan.price} /></div>
          <p className="muted" style={{ marginTop: 'var(--s2)' }}>{t('pay.what')}</p>
        </Card>

        <Card>
          <div className="section-title">{t('pay.payTo')}</div>
          <div className="stack-sm">
            <QrCode value={upiLink} size={200} label={t('pay.scanQr')} />
            <div className="center">
              <div className="small dim">{t('pay.upiId')}</div>
              <strong className="num">{account.upiId}</strong>
            </div>
            <a className="btn" href={upiLink}>{t('cus.payNow')} · ₹{plan.price}</a>
            <div className="small dim center">
              {account.bankName} · A/C {account.accountNo} · {account.ifsc}
            </div>
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
            <Field label={`${t('pay.screenshot')} (${t('common.optional')})`}>
              <Button variant="quiet" size="sm">📷 {t('pay.screenshot')}</Button>
            </Field>
          </div>
        </Card>

        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? t('common.loading') : t('pay.submit')}
        </Button>
      </div>
    </>
  )
}

/* ================================================================== */
/* THE WAITING SCREEN                                                   */
/* A full screen, not a toast and not a banner she can miss. It answers  */
/* the only question she has: did my 50 rupees go through?              */
/* ================================================================== */

export function PaymentWaiting() {
  const t = useT()
  const nav = useNavigate()
  const [data, loading, setData] = useAsync(() => api.subscription(), [])

  /**
   * Poll while she is waiting.
   *
   * She is sitting on this screen precisely because she is waiting on someone
   * else, so the screen has to change by itself. Making her pull-to-refresh to
   * discover she was approved is the one interaction this audience will not
   * think to try. Ten seconds is frequent enough to feel immediate and light
   * enough for rural 4G, and it stops the moment she is approved or rejected.
   */
  const status = data?.status
  const settled = status === 'ACTIVE' || status === 'PAYMENT_REJECTED'

  useEffect(() => {
    if (loading || settled) return
    const id = setInterval(() => {
      api.subscription().then(setData).catch(() => {
        /* offline for a moment - the next tick will pick it up */
      })
    }, 10_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, settled])

  if (loading || !data) {
    return <div className="app-shell"><div className="screen"><Loading /></div></div>
  }

  const latest = data.payments[0]

  if (data.status === 'ACTIVE') {
    return (
      <div className="app-shell">
        <div className="screen screen--nonav stack center" style={{ justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ fontSize: '4rem' }} aria-hidden="true">🎉</div>
          <h1 className="h1">{t('wait.approved')}</h1>
          <p className="muted">{t('wait.approvedSub')}</p>
          <Button onClick={() => nav('/seller/upload', { replace: true })}>{t('wait.addFirst')}</Button>
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

  const spoken = `${t('wait.title')}. ${t('wait.sub')}. ${t('wait.eta')}. ${t('wait.sms')}.`

  return (
    <div className="app-shell">
      <AppBar title={t('pay.title')} right={<AudioHelpButton text={spoken} />} />
      <div className="screen screen--nonav stack">
        <div className="center stack-sm" style={{ paddingTop: 'var(--s5)' }}>
          <div style={{ fontSize: '4rem' }} aria-hidden="true">⏳</div>
          <h1 className="h1">{t('wait.title')}</h1>
          <p className="h3" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{t('wait.sub')}</p>
        </div>

        <Notice tone="info">{t('wait.eta')}</Notice>

        {/* The line that stops her calling support. */}
        <Card className="notice--ok">
          <div className="row">
            <span style={{ fontSize: '1.5rem' }} aria-hidden="true">📩</span>
            <strong>{t('wait.sms')}</strong>
          </div>
        </Card>

        {latest && (
          <Card>
            <div className="section-title">{t('wait.youSent')}</div>
            <div className="stack-sm">
              <div className="row-between">
                <span className="dim">{t('pay.title')}</span>
                <strong><Rupees value={latest.amount} /></strong>
              </div>
              <div className="row-between">
                <span className="dim">{t('pay.utr')}</span>
                <strong className="num">{latest.utr}</strong>
              </div>
              <div className="row-between">
                <span className="dim">{t('common.today')}</span>
                <span className="num">
                  {new Date(latest.submittedAt).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </Card>
        )}

        <p className="muted small">{t('wait.canDoMeanwhile')}</p>

        <div className="btn-row">
          <Button variant="ghost" onClick={() => nav('/seller/help')}>🎓 {t('wait.watchTraining')}</Button>
          <Button variant="ghost" onClick={() => nav('/seller/help')}>💬 {t('wait.contactHelp')}</Button>
        </div>
        <Button variant="quiet" onClick={() => nav('/seller')}>{t('biz.title')}</Button>

        <Notice tone="warn">
          Demo: approve this from the admin API —
          <code style={{ display: 'block', marginTop: 4, fontSize: '0.8rem' }}>
            POST /api/admin/payments/{latest?.id ?? '<id>'}/approve
          </code>
        </Notice>
      </div>
    </div>
  )
}
