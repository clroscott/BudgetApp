import { apiGet, apiPost, apiPut } from '../api/apiClient'
import type { CurrentUser } from './authApi'
import type { VerificationProof, VerificationStatus } from './loginVerificationApi'

export interface PendingEmailChange {
  email: string
  requestedAtUtc: string
  expiresAtUtc: string
  isExpired: boolean
}
export interface AccountSettings {
  user: CurrentUser
  pendingEmailChange: PendingEmailChange | null
  version: string
  verification?: VerificationStatus
}
export const getAccountSettings = () => apiGet<AccountSettings>('/api/auth/settings')
export const saveDisplayName = (displayName: string, version: string) =>
  apiPut<AccountSettings>('/api/auth/profile', { displayName, version })
export const changePassword = (currentPassword: string, newPassword: string, proof?: VerificationProof) =>
  apiPost<void>('/api/auth/change-password', { currentPassword, newPassword, ...(proof ? { proof } : {}) })
