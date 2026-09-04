import {
  useCallback, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react'
import { useI18n } from '../i18n/I18nProvider.js'
import { ApiError } from '../lib/api.js'

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

type Variant = 'primary' | 'ok' | 'danger' | 'quiet'

export function Button({
  variant = 'primary', small, className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  const v: Record<Variant, string> = {
    primary: '', ok: 'btn--ok', danger: 'btn--danger', quiet: 'btn--quiet',
  }
  return (
    <button
      type="button"
      className={`btn ${v[variant]} ${small ? 'btn--sm' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Pill({
  tone = 'neutral', children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info'
  children: ReactNode
}) {
  const cls = tone === 'neutral' ? '' : `pill--${tone}`
  return <span className={`pill ${cls}`}>{children}</span>
}

export function Card({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return <div className={`card ${flush ? 'card--flush' : ''}`}>{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section__t">{children}</h2>
}

export function Loading() {
  return <div className="spinner" role="status" aria-live="polite" />
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div className="empty">
      <div className="empty__i" aria-hidden="true">{icon}</div>
      <div className="empty__t">{title}</div>
      {body && <div className="small">{body}</div>}
    </div>
  )
}

export function Notice({
  tone = 'neutral', children,
}: {
  tone?: 'neutral' | 'warn' | 'danger'
  children: ReactNode
}) {
  const cls = tone === 'neutral' ? '' : `notice--${tone}`
  return <div className={`notice ${cls}`}>{children}</div>
}

export function Field({
  label, error, children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label className="field__l">{label}</label>
      {children}
      {error && <div className="field__err" role="alert">⚠ {error}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Errors, in the language on screen                                   */
/* ------------------------------------------------------------------ */

/**
 * The API answers in English and, where it matters, Marathi. This picks the
 * one the admin is reading rather than translating on the client - a
 * translation table on this side would drift from the server's wording the
 * first time somebody edited a message.
 */
export function useErrorText(): (err: unknown) => string {
  const { lang, t } = useI18n()
  return useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) return t('err.signedOut')
        return err.text(lang)
      }
      return t('c.unknownError')
    },
    [lang, t],
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  const text = useErrorText()
  if (!error) return null
  return <Notice tone="danger">{text(error)}</Notice>
}

/* ------------------------------------------------------------------ */
/* Async loading                                                       */
/* ------------------------------------------------------------------ */

/**
 * Returns [data, loading, error, reload]. Deliberately exposes `reload`
 * rather than a setter: every admin action changes server state, so the
 * honest refresh is to ask the server again instead of patching a local copy
 * and hoping it matches.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): [T | null, boolean, unknown, () => void] {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: unknown }>({
    data: null, loading: true, error: null,
  })
  const [nonce, setNonce] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef.current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error: unknown) => alive && setState({ data: null, loading: false, error }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return [state.data, state.loading, state.error, reload]
}
