import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearToken, getToken, setToken } from '../api'
import type { User } from '../types'
import { useLocale } from './SettingsContext'
import { useToast } from './ToastContext'

type AuthMode = 'login' | 'register'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: FormData) => Promise<void>
  logout: () => void
  updateProfile: (data: FormData) => Promise<void>
  authOpen: boolean
  authMode: AuthMode
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
  profileOpen: boolean
  openProfile: () => void
  closeProfile: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [profileOpen, setProfileOpen] = useState(false)
  const { t } = useLocale()
  const { toast } = useToast()

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    let active = true
    api.me()
      .then((result) => { if (active) setUser(result.user) })
      .catch(() => clearToken())
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password)
    setToken(result.token)
    setUser(result.user)
    setAuthOpen(false)
    toast(t('auth.loginSuccess'))
  }, [t, toast])

  const register = useCallback(async (data: FormData) => {
    const result = await api.register(data)
    setToken(result.token)
    setUser(result.user)
    setAuthOpen(false)
    toast(t('auth.registerSuccess'))
  }, [t, toast])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setProfileOpen(false)
  }, [])

  const updateProfile = useCallback(async (data: FormData) => {
    const result = await api.updateProfile(data)
    setUser(result.user)
    setProfileOpen(false)
    toast(t('profile.saved'))
  }, [t, toast])

  const openAuth = useCallback((mode: AuthMode = 'login') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, login, register, logout, updateProfile,
    authOpen, authMode, openAuth, closeAuth: () => setAuthOpen(false),
    profileOpen, openProfile: () => setProfileOpen(true), closeProfile: () => setProfileOpen(false),
  }), [user, loading, login, register, logout, updateProfile, authOpen, authMode, openAuth, profileOpen])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
