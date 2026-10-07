import { ApiError, apiGet, apiPost } from '../api/apiClient'
import type { PendingLogin, VerificationProof } from './loginVerificationApi'

export interface CurrentUser {
  id: string
  email: string
  displayName: string
  emailConfirmed: boolean
  loginVerificationEnabled: boolean
  isApplicationAdministrator?: boolean
  isApplicationOwner?: boolean
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

export function register(request: RegisterRequest): Promise<PasswordRecoveryRequestedResponse> {
  return apiPost<PasswordRecoveryRequestedResponse>('/api/auth/register', request)
}

export function resendConfirmation(): Promise<PasswordRecoveryRequestedResponse> {
  return apiPost('/api/auth/resend-confirmation', {})
}

export function confirmEmail(userId: string, token: string, changeEmail = false): Promise<CurrentUser> {
  return apiPost(`/api/auth/${changeEmail ? 'confirm-email-change' : 'confirm-email'}`, { userId, token })
}

// Shared backend flow for the account settings interface (#156).
export function requestEmailChange(newEmail: string, currentPassword: string, proof?: VerificationProof): Promise<PasswordRecoveryRequestedResponse> {
  return apiPost('/api/auth/request-email-change', { newEmail, currentPassword, ...(proof ? { proof } : {}) })
}

export function login(request: LoginRequest): Promise<CurrentUser | PendingLogin> {
  return apiPost<CurrentUser | PendingLogin>('/api/auth/login', request)
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
