import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, Button, Card, Choice, EmptyState, Field, Loading, Notice, TextInput, useAsync,
} from '../../components/ui.js'

export default function CustomerFeedback() {
  const t = useT()
  const nav = useNavigate()
  const [ordersData, loadingOrders] = useAsync(() => api.myOrders(), [])
  const [feedbackData, loadingFeedback] = useAsync(() => api.myFeedback(), [])
  const [orderId, setOrderId] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (loadingOrders || loadingFeedback) {
    return <><AppBar title="Feedback" backTo="/shop" /><div className="screen"><Loading /></div></>
  }

  const submitted = new Set((feedbackData?.feedback ?? []).map((f) => f.orderId))
  const completed = (ordersData?.orders ?? []).filter((o) => o.status === 'COMPLETED' && !submitted.has(o.id))

  async function submit() {
    if (!orderId) {
      setError('ऑर्डर निवडा')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.submitFeedback(orderId, rating, comment.trim() || undefined)
      setMessage('तुमचा अभिप्राय यशस्वीरित्या नोंदवला गेला.')
      setOrderId('')
      setComment('')
      setRating(5)
    } catch (e) {
      setError(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Feedback submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar title="Feedback" backTo="/shop" />
      <div className="screen stack">
        {message && <Notice tone="ok">{message}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}

        {completed.length === 0 ? (
          <Card>
            <EmptyState icon="⭐" title="सध्या अभिप्रायासाठी ऑर्डर नाही" body="पूर्ण झालेल्या ऑर्डरसाठी एकदाच अभिप्राय देता येतो." />
          </Card>
        ) : (
          <Card>
            <Field label="पूर्ण झालेली ऑर्डर" required>
              <div className="stack-sm">
                {completed.map((o) => (
                  <Choice
                    key={o.id}
                    selected={orderId === o.id}
                    onSelect={() => setOrderId(o.id)}
                    title={o.id}
                    sub={o.items.map((i) => i.name).join(', ')}
                  />
                ))}
              </div>
            </Field>

            <Field label="रेटिंग" required>
              <div className="row" role="radiogroup" aria-label="Rating" style={{ gap: 6 }}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`btn ${rating === value ? '' : 'btn--quiet'}`}
                    onClick={() => setRating(value)}
                    aria-pressed={rating === value}
                  >
                    {value} ★
                  </button>
                ))}
              </div>
            </Field>

            <Field label="अभिप्राय (ऐच्छिक)">
              <TextInput
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                placeholder="तुमचा अनुभव सांगा"
              />
            </Field>

            <Button onClick={() => void submit()} disabled={busy || !orderId}>
              {busy ? t('common.loading') : 'अभिप्राय पाठवा'}
            </Button>
          </Card>
        )}

        <Button variant="quiet" onClick={() => nav('/shop')}>शॉपिंग सुरू ठेवा</Button>
      </div>
    </>
  )
}
