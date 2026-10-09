import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type CurrentUser,
  type LoginRequest,
  type RegisterRequest,
} from './authApi'
import { AuthContext, type AuthContextValue } from './authContext'
import { isPendingLogin } from './loginVerificationApi'
import { useReadOwner } from '../api/useReadOwner'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const reads = useReadOwner('auth-session')
  const transition = useRef(0)
  const changingSession = useRef(false)

  const updateUser = useCallback((currentUser: CurrentUser | null) => {
    transition.current++
    changingSession.current = false
    reads.invalidate()
    setUser(currentUser)
    setHasLoaded(true)
    setInitializationError(null)
    setIsLoading(false)
  }, [reads])

  const refresh = useCallback(async () => {
    if (changingSession.current) return
    const attempt = reads.begin()
    if (!attempt) return
    setIsLoading(true)
    setInitializationError(null)

    try {
      const currentUser = await getCurrentUser(attempt.signal)
      if (attempt.isCurrent()) { setUser(currentUser); setHasLoaded(true) }
    } catch (error) {
      if (attempt.isCurrent()) setInitializationError(
        error instanceof Error ? error.message : 'Unable to check your session.',
      )
    } finally {
      if (attempt.isCurrent()) setIsLoading(false)
      attempt.finish()
    }
  }, [reads])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!user || user.emailConfirmed) return
    const userId = user.id
    let disposed = false
    let checking = false
    const checkVerification = async () => {
      if (disposed || checking || changingSession.current || reads.hasPending() || document.visibilityState === 'hidden') return
      const attempt = reads.begin()
      if (!attempt) return
      checking = true
      try {
        const currentUser = await getCurrentUser(attempt.signal)
        if (!disposed && attempt.isCurrent()) {
          setHasLoaded(true)
          setUser(existing => existing?.id === userId && !existing.emailConfirmed ? currentUser : existing)
        }
      } catch {
        // Keep the page and entered values on a transient failure. Explicit status
        // checking still offers the normal error/retry flow; never resend an email.
      } finally { checking = false; attempt.finish() }
    }
    const onReturn = () => { void checkVerification() }
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      disposed = true
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [reads, user])

  const login = useCallback(async (request: LoginRequest) => {
    const operation = ++transition.current
    changingSession.current = true
    reads.invalidate()
    setIsLoading(false)
    try {
      const currentUser = await loginRequest(request)
      if (reads.isContextCurrent() && transition.current === operation) {
        setUser(isPendingLogin(currentUser) ? null : currentUser)
        setHasLoaded(true)
        setInitializationError(null)
      }
      return currentUser
    } finally { if (transition.current === operation) changingSession.current = false }
  }, [reads])

  const register = useCallback(async (request: RegisterRequest) => {
    return registerRequest(request)
  }, [])

  const logout = useCallback(async () => {
    const operation = ++transition.current
    changingSession.current = true
    reads.invalidate()
    setIsLoading(false)
    try {
      await logoutRequest()
      if (reads.isContextCurrent() && transition.current === operation) {
        setUser(null)
        setHasLoaded(true)
        setInitializationError(null)
      }
    } finally { if (transition.current === operation) changingSession.current = false }
  }, [reads])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    initializationError,
    hasLoaded,
    login,
    register,
    updateUser,
    logout,
    refresh,
  }), [hasLoaded, initializationError, isLoading, login, logout, refresh, register, updateUser, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
