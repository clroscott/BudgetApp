import { createContext } from 'react'
import type { PendingLogin } from './loginVerificationApi'
import type {
  CurrentUser,
  LoginRequest,
  RegisterRequest,
  PasswordRecoveryRequestedResponse,
} from './authApi'

export interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  initializationError: string | null
  hasLoaded?: boolean
  login: (request: LoginRequest) => Promise<CurrentUser | PendingLogin>
  register: (request: RegisterRequest) => Promise<PasswordRecoveryRequestedResponse>
  updateUser: (user: CurrentUser | null) => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
