import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest, invalidateApiCache, setCsrfToken } from '../api/client'
export { homeForRole } from './roleAccess.mjs'

export type UserRole = 'admin' | 'department_coordinator' | 'faculty' | 'club_representative'
export type AuthUser = {
  id: string
  username: string
  role: UserRole
  dataset_id: string | null
  department: string | null
  faculty_source_id: string | null
  club_id: string | null
}
type AuthPayload = { user: AuthUser; csrf_token: string }
type AuthValue = {
  user: AuthUser | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<AuthUser>
  signOut: () => Promise<void>
}
const AuthContext = createContext<AuthValue | null>(null)

export function roleLabel(role: UserRole): string {
  return ({
    admin: "Dean's Office Admin",
    department_coordinator: 'Department Coordinator',
    faculty: 'Faculty',
    club_representative: 'Club Representative',
  })[role]
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiRequest<AuthPayload>('/auth/session')
      .then((payload) => {
        if (!active) return
        invalidateApiCache()
        setCsrfToken(payload.csrf_token)
        setUser(payload.user)
      })
      .catch(() => {
        if (active) { setCsrfToken(''); setUser(null) }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const payload = await apiRequest<AuthPayload>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    })
    invalidateApiCache()
    setCsrfToken(payload.csrf_token)
    setUser(payload.user)
    return payload.user
  }, [])

  const signOut = useCallback(async () => {
    await apiRequest<void>('/auth/logout', { method: 'POST' })
    invalidateApiCache()
    setCsrfToken('')
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
