import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react'
import { api, getToken, setToken, type AdminSession } from '../lib/api.js'
import { useToast } from './ToastContext.js'
import { useI18n } from '../i18n/I18nProvider.js'

/**
 * One admin account for now - a single ADMIN_EMAIL and password held in the
 * backend's environment.
 *
 * The limitation, stated so nobody discovers it during an argument: every
 * action is recorded against that one identity, so `verifiedBy` on an approved
 * payment says "admin@shantabazar.in" no matter which member of staff clicked
 * it. The moment two people share the login, "who approved this?" has one
 * answer for everybody. Per-person accounts is a backend change.
 */

const SESSION_KEY = 'wb.admin.session'

interface AuthValue {
  session: AdminSession | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

function storedSession(): AdminSession | null {
  if (!getToken()) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AdminSession) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const { t } = useI18n()
  const [session, setSession] = useState<AdminSession | null>(storedSession)

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.signIn(email, password)
    setToken(res.session.token)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(res.session))
    } catch {
      /* private mode - it just will not survive a refresh */
    }
    setSession(res.session)
    toast(t('ok.signedIn'))
  }, [toast, t])

  const signOut = useCallback(() => {
    // Tell the server first - the request reads the token before it is
    // cleared. Not awaited: she must end up signed out on this desk whether or
    // not the network cooperates, and the session idles out on its own.
    void api.logout().catch(() => {
      /* offline - nothing more this side can do */
    })
    setToken(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* nothing to clean up */
    }
    setSession(null)
    toast(t('ok.signedOut'))
  }, [toast, t])

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
