import {
  useCallback,
  useEffect,
  useMemo,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [initializationError, setInitializationError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setInitializationError(null)

    try {
      setUser(await getCurrentUser())
    } catch (error) {
      setInitializationError(
        error instanceof Error ? error.message : 'Unable to check your session.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!user || user.emailConfirmed) return
    const userId = user.id
    let disposed = false
    let checking = false
    const checkVerification = async () => {
      if (checking || document.visibilityState === 'hidden') return
      checking = true
      try {
        const currentUser = await getCurrentUser()
        if (!disposed) {
          setUser(existing => existing?.id === userId && !existing.emailConfirmed ? currentUser : existing)
        }
      } catch {
        // Keep the page and entered values on a transient failure. Explicit status
        // checking still offers the normal error/retry flow; never resend an email.
      } finally { checking = false }
    }
    const onReturn = () => { void checkVerification() }
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      disposed = true
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [user])

  const login = useCallback(async (request: LoginRequest) => {
    const currentUser = await loginRequest(request)
    setUser(isPendingLogin(currentUser) ? null : currentUser)
    return currentUser
  }, [])

  const register = useCallback(async (request: RegisterRequest) => {
    return registerRequest(request)
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    initializationError,
    login,
    register,
    updateUser: setUser,
    logout,
    refresh,
  }), [initializationError, isLoading, login, logout, refresh, register, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
