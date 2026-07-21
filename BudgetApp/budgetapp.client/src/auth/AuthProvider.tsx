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

  const login = useCallback(async (request: LoginRequest) => {
    const currentUser = await loginRequest(request)
    setUser(currentUser)
    return currentUser
  }, [])

  const register = useCallback(async (request: RegisterRequest) => {
    const currentUser = await registerRequest(request)
    setUser(currentUser)
    return currentUser
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
    logout,
    refresh,
  }), [initializationError, isLoading, login, logout, refresh, register, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
