import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { Session } from '@shared/types.js'
import { setToken } from '../lib/api.js'
import { configureImageCache } from '../lib/imageCache.js'

/**
 * Session state. One phone number can be both a seller and a customer, so the
 * account carries a role rather than being two separate accounts - that avoids
 * asking the same woman for her details twice.
 *
 * The OTP is verified on the SERVER. This context only stores what came back.
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
  const signOut = useCallback(() => setSession(null), [])
  const patchSession = useCallback(
    (p: Partial<Session>) => setSession((s) => (s ? { ...s, ...p } : s)),
    [],
  )

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
