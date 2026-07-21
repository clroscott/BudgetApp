import { createContext } from 'react'
import type {
  CurrentUser,
  LoginRequest,
  RegisterRequest,
} from './authApi'

export interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  initializationError: string | null
  login: (request: LoginRequest) => Promise<CurrentUser>
  register: (request: RegisterRequest) => Promise<CurrentUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
