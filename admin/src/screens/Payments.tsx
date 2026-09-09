import { useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { useToast } from '../store/ToastContext.js'
import { IconPayments } from '../components/icons.js'
import { api, type PaymentRow } from '../lib/api.js'
import { rupees, waited, when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import {
  Button, Card, CopyValue, EmptyState, ErrorNote, Field, Loading, Notice, Pill,
  useAsync, useErrorText,
} from '../components/ui.js'

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

/**
 * Approving a ₹50 payment is the single most consequential click in this
 * console: it grants her five slots and flips her to ACTIVE, which is the
 * moment she can actually sell anything.
 *
 * So the waiting time is shown, prominently, and rejection cannot happen
 * without a reason - she reads that reason in her own app, and "UTR did not
 * match" with no explanation produces a support call this programme has no
 * staff to answer.
 */
export function Payments() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('PENDING')
  const [data, loading, error, reload] = useAsync(() => api.payments(tab), [tab])

  const rows = data?.payments ?? []

  return (
    <>
      <TopBar title={t('pay.title')} />
      <div className="body stack">
        <div className="row wrap">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as Tab[]).map((s) => (
            <Button
              key={s}
              small
              variant={tab === s ? 'primary' : 'quiet'}
              onClick={() => setTab(s)}
            >
              {t(`pay.${s.toLowerCase()}`)}
            </Button>
          ))}
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconPayments} title={t('pay.empty')} body={t('pay.emptySub')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((p) => (
              <PaymentCard key={p.id} payment={p} onDone={reload} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function PaymentCard({ payment, onDone }: { payment: PaymentRow; onDone: () => void }) {
  const t = useT()
  const { toast } = useToast()
  const errorText = useErrorText()

  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const w = waited(payment.submittedAt)
  const pending = payment.status === 'PENDING'

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setErr('')
    try {
      await action()
      // Said before the list reloads: the row is about to disappear, and a row
      // vanishing is not the same as being told what it did.
      toast(done)
      onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function reject() {
    // Required, not encouraged. An empty reason reaches her as silence.
    if (!reason.trim()) {
      setReasonErr(t('c.required'))
      return
    }
    void run(() => api.rejectPayment(payment.id, reason.trim()), t('ok.paymentRejected'))
  }

  return (
    <Card>
      <div className="row wrap" style={{ gap: 12 }}>
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            {/* Her name as she gave it - never transliterated. */}
            <span className="strong">{payment.sellerName}</span>
            <span className="small dim mono">{payment.womenBizId}</span>
            <StatusPill status={payment.status} />
            {pending && (
              <Pill tone={w.unit === 'd' ? 'danger' : 'warn'}>
                {t('pay.waiting')} {w.value}{t(w.unit === 'd' ? 'c.daysShort' : 'c.hoursShort')}
              </Pill>
            )}
            {/* The ordinary case: submit tapped twice on a slow connection.
                Flagging it stops a duplicate being approved as a second pack. */}
            {payment.duplicateUtr && <Pill tone="danger">{t('pay.duplicate')}</Pill>}
          </div>
          <div className="small dim">
            {rupees(payment.amount)} · <span className="mono">{payment.phone}</span>
          </div>
          <div className="small dim mono">{t('pay.utr')} {payment.utr}</div>
          {/* She paid from this UPI ID, and reconciling it against the bank
              statement means having it exactly right. */}
          {payment.payerUpi && (
            <div className="small dim">
              {t('pay.payerUpi')}{' '}
              <CopyValue value={payment.payerUpi} label={t('c.copy')} copiedText={t('c.upiCopied')} />
            </div>
          )}
          <div className="small dim-2">
            {t('pay.submitted')} {when(payment.submittedAt)}
            {payment.verifiedBy && ` · ${t('pay.verifiedBy')} ${t('c.by')} ${payment.verifiedBy}`}
          </div>
          {payment.rejectReason && (
            <div className="small" style={{ color: 'var(--danger)' }}>
              {t('c.reason')}: {payment.rejectReason}
            </div>
          )}
        </div>

        {pending && !rejecting && (
          <div className="row">
            <Button variant="ok" small disabled={busy} onClick={() => void run(() => api.approvePayment(payment.id), t('ok.paymentApproved'))}>
              {t('pay.approve')}
            </Button>
            <Button variant="danger" small disabled={busy} onClick={() => setRejecting(true)}>
              {t('pay.reject')}
            </Button>
          </div>
        )}
      </div>

      {pending && !rejecting && (
        <div className="small dim-2" style={{ marginTop: 8 }}>{t('pay.approveNote')}</div>
      )}

      {rejecting && (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Field label={t('pay.rejectReason')} error={reasonErr}>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonErr('') }}
              placeholder={t('pay.rejectReasonHint')}
            />
          </Field>
          <div className="small dim-2">{t('pay.rejectReasonHint')}</div>
          <div className="row">
            <Button variant="danger" small disabled={busy} onClick={reject}>
              {t('pay.rejectConfirm')}
            </Button>
            <Button variant="quiet" small disabled={busy} onClick={() => setRejecting(false)}>
              {t('c.cancel')}
            </Button>
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 10 }}><Notice tone="danger">{err}</Notice></div>}
    </Card>
  )
}

function StatusPill({ status }: { status: string }) {
  const t = useT()
  if (status === 'APPROVED') return <Pill tone="ok">{t('pay.approved')}</Pill>
  if (status === 'REJECTED') return <Pill tone="danger">{t('pay.rejected')}</Pill>
  return <Pill tone="warn">{t('pay.pending')}</Pill>
}
