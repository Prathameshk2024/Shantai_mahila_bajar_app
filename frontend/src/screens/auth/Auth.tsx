import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { isValidPhone } from '@shared/seller.js'
import { useT } from '../../i18n/I18nProvider.js'
import { homeFor, useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import {
  clearRegisterTicket, liveTicket, stashRegisterTicket, takeRegisterTicket,
} from '../../lib/registerTicket.js'

// Re-exported so the screens that already import them here keep working.
export { clearRegisterTicket, stashRegisterTicket, takeRegisterTicket }
import {
  AppBar, Button, Field, Notice, OtpInput, TextInput,
} from '../../components/ui.js'
import { IconNext } from '../../components/icons.js'
import { useToast } from '../../store/ToastContext.js'
import {
  WIDGET_SESSION_LOST, forgetWidgetSession,
  retryWidgetOtp, sendWidgetOtp, verifyWidgetOtp, widgetEnabled, widgetOtpLength,
} from '../../lib/msg91Widget.js'

/**
 * Six, matching OTP_DIGITS on the server.
 *
 * It was four, which is ten thousand guesses. Six is a million, and together
 * with the five-attempt cap on the server that is the difference between a
 * short script and no chance at all.
 */
export const OTP_LENGTH = widgetEnabled ? widgetOtpLength : 6

type RoleParam = 'seller' | 'customer'

function roleFrom(value: string | undefined): RoleParam {
  return value === 'seller' ? 'seller' : 'customer'
}


/**
 * BOTH LANDING DOORS COME THROUGH HERE
 * ====================================
 * "मला विकायचं आहे" and "मला खरेदी करायची आहे" are two intents, not two
 * systems: each one enters this screen with its role in the path, and the role
 * is what survives all the way through OTP and registration to decide where
 * she ends up. There is no second auth flow anywhere in the app.
 *
 * `mode` only changes what happens to a number with no record behind it:
 *   join  - a seller is taken straight into the registration wizard
 *   login - she is told plainly that she has to register, and offered the way
 * Either way the intent she picked on the landing page is preserved.
 *
 * Already signed in with this role? Then the login is already done, and the
 * only correct thing to do is let her through. Making her verify an OTP she
 * has already verified is how a back press starts to look like being logged
 * out - see AuthContext for the rest of that story.
 */
export function PhoneScreen({ mode }: { mode: 'join' | 'login' }) {
  const { role: roleParam } = useParams()
  const role = roleFrom(roleParam)
  const t = useT()
  const nav = useNavigate()
  const { session } = useAuth()
  const { toast } = useToast()

  /**
   * A registration she has already passed the OTP for, still in date.
   *
   * Read once on mount. If she is holding one, this screen must not ask for
   * another code - it offers to take her back into the wizard instead, which
   * is the difference between one SMS and two every time she presses back.
   */
  const [pending] = useState(() => (role === 'seller' ? liveTicket() : null))

  const [phone, setPhone] = useState(pending?.phone ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (session?.role === role) return <Navigate to={homeFor(role)} replace />

  async function send() {
    if (!isValidPhone(phone)) {
      setErr(t('onb.phoneInvalid'))
      return
    }
    setErr('')
    setBusy(true)
    try {
      /**
       * With the MSG91 widget the SMS is sent from here, not by our server -
       * that is the whole reason it needs no DLT registration. She is still
       * nobody until the token the widget gives back has been checked by the
       * server against the number she typed.
       */
      if (widgetEnabled) {
        await sendWidgetOtp(phone)
        toast(t('ok.otpSent'))
        nav(`/otp/${role}?phone=${phone}&mode=${mode}`)
        return
      }

      const res = await api.sendOtp(phone)

      // The server rate-limits resends to one every 30s and answers 200 with
      // { sent: false }. Navigating anyway would drop her on an OTP screen
      // for a message that was never sent.
      if (!res.sent) {
        setErr(t('onb.otpCooldown', { n: Math.ceil((res.cooldownMs ?? 30_000) / 1000) }))
        return
      }

      toast(t('ok.otpSent'))

      // Demo mode returns the code so the skeleton works without SMS.
      const demo = res.demoCode ? `&demo=${res.demoCode}` : ''
      nav(`/otp/${role}?phone=${phone}&mode=${mode}${demo}`)
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : t('onb.otpSendFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <AppBar
        brand
        title={t('onb.phoneTitle')}
        sub={role === 'seller' ? t('lp.sellerDoor') : t('lp.customerDoor')}
        backTo="/"
        bell={false}
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

        {pending ? (
          <>
            <Notice tone="ok" title={t('onb.resumeTitle')}>{t('onb.resumeBody')}</Notice>
            <Button onClick={() => nav(`/register/seller?phone=${pending.phone}`)}>
              {t('onb.resume')} <IconNext aria-hidden="true" />
            </Button>
            {/* Still offered, for the woman who typed the wrong number. It
                sends a fresh code and abandons the ticket she was holding. */}
            <Button variant="quiet" onClick={() => { clearRegisterTicket(); send() }} disabled={busy}>
              {busy ? t('common.loading') : t('onb.differentNumber')}
            </Button>
          </>
        ) : (
          <Button onClick={send} disabled={busy}>
            {busy ? t('common.loading') : t('onb.sendOtp')}
          </Button>
        )}
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
  const { session, signIn } = useAuth()
  const { toast } = useToast()

  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /** Verified, but this number has no seller record yet. */
  const [needsRegistration, setNeedsRegistration] = useState(false)

  // Read ONCE, on mount. Verifying a customer's OTP signs her in a moment
  // before it navigates, and a live check here would see that new session and
  // redirect her to /shop out from under the flow.
  const [arrivedSignedIn] = useState(() => session?.role === role)
  if (arrivedSignedIn) return <Navigate to={homeFor(role)} replace />

  async function verify() {
    setBusy(true)
    setErr('')
    try {
      /**
       * Two steps with the widget, and the second is the one that counts.
       * MSG91 checks the digits and returns a JWT; the server then trades that
       * JWT for the number it was issued for and refuses it if that is not the
       * number she typed. A token alone proves SOME phone passed an OTP, which
       * is not the same as hers.
       */
      const credential = widgetEnabled ? await verifyWidgetOtp(code) : code
      const res = await api.verifyOtp(phone, credential, role)

      if (res.registered && res.session) {
        signIn(res.session)
        toast(t('ok.loggedIn'))
        nav(homeFor(role), { replace: true })
        return
      }

      // A customer IS authenticated here - only her name is missing - so she
      // is signed in and taken to the one screen that asks for it, which
      // writes with her own token. Stopping to tell her she must register
      // would be an interstitial in front of a single question.
      if (role === 'customer' && res.session) {
        signIn(res.session)
        nav('/register/customer', { replace: true })
        return
      }

      // Her proof that this number passed an OTP. The wizard cannot register
      // without it, so it is kept before any navigation happens.
      if (res.ticket) stashRegisterTicket(res.ticket)

      // "join" on the seller door means she already said she is new, so the
      // wizard is what she asked for and an interstitial would just be a tap.
      if (role === 'seller' && mode === 'join') {
        nav(`/register/seller?phone=${phone}`, { replace: true })
        return
      }

      // A seller who came through "log in" and has no record. Nothing to sign
      // in to, so she is told plainly and offered the way forward.
      setNeedsRegistration(true)
    } catch (e) {
      // A widget failure - origin refused, session lost, MSG91 unreachable -
      // is not a wrong code, but she is told it is, and on a phone there is no
      // console to check. In dev the real message is shown instead; in
      // production she still gets the plain Marathi one.
      if (import.meta.env.DEV) console.error('[otp] verify failed:', e)

      // The widget's OTP session lives in page memory, so a reload between the
      // phone screen and this one loses it. Telling her the code is wrong
      // sends her back to the keypad, where nothing she types can work; the
      // way out is the resend button directly below this message.
      if (e instanceof Error && e.message === WIDGET_SESSION_LOST) {
        setErr(t('onb.otpSessionLost'))
        return
      }

      // On the widget path MSG91 has already checked the digits in the browser
      // before our server hears about it, so a 401 from us is never "she
      // mistyped". It is an access token the exchange refused, and MSG91
      // verifies a request once - so those digits are spent however right they
      // were. Telling her they are wrong sends her to retype a correct code
      // for ever; the only thing that can work is a new one.
      if (widgetEnabled && e instanceof ApiError && e.status === 401) {
        forgetWidgetSession()
        setErr(t('onb.otpSessionLost'))
        return
      }

      const generic = import.meta.env.DEV ? `${t('onb.otpWrong')} — ${String(e)}` : t('onb.otpWrong')
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : generic)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Send it again. `retryOtp` rather than `sendOtp` on the widget path: MSG91
   * treats a resend as a retry on the session it already opened, and starting a
   * new one would invalidate the code she may be reading off her screen.
   */
  async function resend() {
    setCode('')
    setErr('')
    try {
      if (widgetEnabled) await retryWidgetOtp(phone)
      else await api.sendOtp(phone)
      toast(t('ok.otpSent'))
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : t('onb.otpSendFailed'))
    }
  }

  function goRegister() {
    nav(`/register/seller?phone=${phone}`, { replace: true })
  }

  return (
    <div className="app-shell">
      <AppBar
        brand
        title={t('onb.otpTitle')}
        sub={`${t('onb.otpSentTo')} +91 ${phone}`}
        bell={false}
        onBack={() => nav(-1)}
      />
      <div className="screen screen--nonav stack">
        {needsRegistration ? (
          /* Say what happened and what happens next, in that order. She typed
             the right OTP - that part worked - and the thing that is missing
             is a record, not a mistake she made. */
          <>
            <Notice tone="warn" title={t('onb.needRegisterTitle')}>
              {t('onb.needRegisterSell')}
            </Notice>
            <Button onClick={goRegister}>
              {t('onb.registerNow')} <IconNext aria-hidden="true" />
            </Button>
            <Button variant="quiet" onClick={() => nav('/', { replace: true })}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <OtpInput value={code} onChange={(v) => { setCode(v); setErr('') }} length={OTP_LENGTH} />
            {err && <div className="field__err center" role="alert">{err}</div>}

            {/* In demo mode the server hands the real code back so the app is
                walkable with no SMS account. It is a real code that is really
                checked - typing anything else is refused. With the widget live
                a real SMS went out, so there is nothing to show her here. */}
            {!widgetEnabled && (
              <Notice tone="info">
                {demo ? `${t('onb.otpDemo')} · ${demo}` : t('onb.otpDemo')}
              </Notice>
            )}

            <Button onClick={verify} disabled={code.length < OTP_LENGTH || busy}>
              {busy ? t('common.loading') : t('onb.otpVerify')}
            </Button>
            <Button variant="quiet" onClick={resend}>
              {t('onb.otpResend')}
            </Button>

            {mode === 'login' && role === 'seller' && (
              <Button variant="ghost" onClick={() => nav('/join/seller')}>
                {t('onb.newHere')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
