import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { Session } from '@shared/types.js'
import { api, onSessionExpired, onTokenRefresh, setToken } from '../lib/api.js'
import { useToast } from './ToastContext.js'
import { useI18n } from '../i18n/I18nProvider.js'
import { configureImageCache } from '../lib/imageCache.js'

/**
 * Session state. One phone number can be both a seller and a customer, so the
 * account carries a role rather than being two separate accounts - that avoids
 * asking the same woman for her details twice.
 *
 * The OTP is verified on the SERVER. This context only stores what came back.
 *
 * WHAT ENDS A SESSION
 * ===================
 * Exactly two things:
 *
 *   1. she presses Log out;
 *   2. the server answers 401, meaning the token it issued is no longer valid.
 *
 * Nothing else. Not a back press, not a reload, not opening /seller a second
 * time. That list used to be longer by accident: the refreshed token the
 * server hands back mid-session was written to the api client's copy only, so
 * the next reload restored the ORIGINAL token from here and threw the slide
 * away. `onTokenRefresh` closes that gap - a re-stamped token is written back
 * into the stored session, which is what makes the seven-day window an
 * inactivity window rather than a countdown from login.
 */

interface AuthValue {
  session: Session | null
  signIn: (s: Session) => void
  signOut: () => void
  patchSession: (p: Partial<Session>) => void
}

const AuthContext = createContext<AuthValue | null>(null)
const KEY = 'wb.session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const { t } = useI18n()

  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(KEY, JSON.stringify(session))
        setToken(session.token)
        // A seller browses her own handful of products; a customer scrolls a
        // whole catalog. Different working sets, different cache sizes.
        if (session.role === 'seller' || session.role === 'customer') {
          configureImageCache(session.role)
        }
      } else {
        localStorage.removeItem(KEY)
        setToken(null)
      }
    } catch {
      /* ignore */
    }
  }, [session])

  const signIn = useCallback((s: Session) => setSession(s), [])

  /**
   * Tell the SERVER, then forget locally.
   *
   * Clearing localStorage alone left the token valid for the rest of its
   * window, so signing out on a borrowed phone did not sign her out of
   * anything. The local state is cleared either way and without waiting: if
   * the network is down she must still end up signed out on this device, and
   * the session will idle out on its own.
   */
  const signOut = useCallback(() => {
    void api.logout().catch(() => {
      /* offline - the session expires on its own, and she is out locally */
    })
    setSession(null)
    toast(t('ok.loggedOut'))
  }, [toast, t])
  const patchSession = useCallback(
    (p: Partial<Session>) => setSession((s) => (s ? { ...s, ...p } : s)),
    [],
  )

  // Subscribed once, for the life of the app, so a refresh that arrives while
  // she is on any screen is kept.
  useEffect(() => {
    const stopRefresh = onTokenRefresh((token) => {
      setSession((s) => (s && s.token !== token ? { ...s, token } : s))
    })
    const stopExpiry = onSessionExpired(() => setSession(null))
    return () => {
      stopRefresh()
      stopExpiry()
    }
  }, [])

  const value = useMemo(
    () => ({ session, signIn, signOut, patchSession }),
    [session, signIn, signOut, patchSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where a signed-in session belongs. One definition, used by every guard. */
export function homeFor(role: Session['role']): string {
  return role === 'seller' ? '/seller' : role === 'customer' ? '/shop' : '/'
}
