import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { isValidPhone } from '@shared/seller.js'
import { useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, AudioHelpButton, Button, Field, Notice, OtpInput, TextInput,
} from '../../components/ui.js'

type RoleParam = 'seller' | 'customer'

function roleFrom(value: string | undefined): RoleParam {
  return value === 'seller' ? 'seller' : 'customer'
}

/**
 * Phone + OTP, reached from one of the two landing-page doors.
 *
 * `mode` decides where a verified number goes next:
 *   join  - a seller with no record is sent to the registration wizard
 *   login - a seller with no record is told to register first
 * A customer needs no registration step: the phone IS the account.
 */
export function PhoneScreen({ mode }: { mode: 'join' | 'login' }) {
  const { role: roleParam } = useParams()
  const role = roleFrom(roleParam)
  const t = useT()
  const nav = useNavigate()

  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!isValidPhone(phone)) {
      setErr(t('onb.phoneInvalid'))
      return
    }
    setErr('')
    setBusy(true)
    try {
      const res = await api.sendOtp(phone)
      // Demo mode returns the code so the skeleton works without SMS.
      const demo = res.demoCode ? `&demo=${res.demoCode}` : ''
      nav(`/otp/${role}?phone=${phone}&mode=${mode}${demo}`)
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <AppBar
        title={t('onb.phoneTitle')}
        sub={role === 'seller' ? t('lp.sellerDoor') : t('lp.customerDoor')}
        backTo="/"
        right={<AudioHelpButton text={t('onb.phoneHint')} />}
      />
      <div className="screen screen--nonav stack">
        <Field
          label={t('onb.phoneLabel')}
          hint={t('onb.phoneHint')}
          error={err}
          required
          htmlFor="phone"
        >
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <span
              className="input"
              style={{
                width: 72, display: 'grid', placeItems: 'center',
                flex: '0 0 auto', fontWeight: 700,
              }}
            >
              +91
            </span>
            <TextInput
              id="phone"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              error={!!err}
              placeholder="9876543210"
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </Field>

        <Button onClick={send} disabled={busy}>
          {busy ? t('common.loading') : t('onb.sendOtp')}
        </Button>
      </div>
    </div>
  )
}

export function OtpScreen() {
  const { role: roleParam } = useParams()
  const role = roleFrom(roleParam)
  const [params] = useSearchParams()
  const phone = params.get('phone') ?? ''
  const mode = params.get('mode') === 'login' ? 'login' : 'join'
  const demo = params.get('demo')

  const t = useT()
  const nav = useNavigate()
  const { signIn } = useAuth()

  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function verify() {
    setBusy(true)
    setErr('')
    try {
      const res = await api.verifyOtp(phone, code, role)

      if (res.registered && res.session) {
        signIn(res.session)
        nav(role === 'seller' ? '/seller' : '/shop', { replace: true })
        return
      }

      // Verified, but this phone has no seller record yet.
      if (mode === 'login') {
        setErr(t('onb.notRegistered'))
        return
      }
      nav(`/register/seller?phone=${phone}`, { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : t('onb.otpWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <AppBar
        title={t('onb.otpTitle')}
        sub={`${t('onb.otpSentTo')} +91 ${phone}`}
        onBack={() => nav(-1)}
      />
      <div className="screen screen--nonav stack">
        <OtpInput value={code} onChange={(v) => { setCode(v); setErr('') }} />
        {err && <div className="field__err center" role="alert">⚠ {err}</div>}

        <Notice tone="info">
          {demo ? `${t('onb.otpDemo')} · ${demo}` : t('onb.otpDemo')}
        </Notice>

        <Button onClick={verify} disabled={code.length < 4 || busy}>
          {busy ? t('common.loading') : t('onb.otpVerify')}
        </Button>
        <Button variant="quiet" onClick={() => { setCode(''); void api.sendOtp(phone) }}>
          {t('onb.otpResend')}
        </Button>

        {mode === 'login' && role === 'seller' && (
          <Button variant="ghost" onClick={() => nav('/join/seller')}>
            {t('onb.newHere')}
          </Button>
        )}
      </div>
    </div>
  )
}
