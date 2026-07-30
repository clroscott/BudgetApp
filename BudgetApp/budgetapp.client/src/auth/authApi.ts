import { ApiError, apiGet, apiPost } from '../api/apiClient'

export interface CurrentUser {
  id: string
  email: string
  displayName: string
}

export interface RegisterRequest {
  displayName: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
  rememberMe: boolean
}

export interface ForgotPasswordRequest {
  email: string
}

export interface PasswordRecoveryRequestedResponse {
  message: string
}

export interface ResetPasswordRequest {
  userId: string
  token: string
  newPassword: string
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await apiGet<CurrentUser>('/api/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }

    throw error
  }
}

export function register(request: RegisterRequest): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/api/auth/register', request)
}

export function login(request: LoginRequest): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/api/auth/login', request)
}

export function logout(): Promise<void> {
  return apiPost<void>('/api/auth/logout', {})
}

export function requestPasswordRecovery(
  request: ForgotPasswordRequest,
): Promise<PasswordRecoveryRequestedResponse> {
  return apiPost<PasswordRecoveryRequestedResponse>(
    '/api/auth/forgot-password',
    request,
  )
}

export function resetPassword(request: ResetPasswordRequest): Promise<void> {
  return apiPost<void>('/api/auth/reset-password', request)
}
