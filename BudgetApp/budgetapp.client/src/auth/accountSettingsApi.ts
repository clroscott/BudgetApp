import { apiGet, apiPost, apiPut } from '../api/apiClient'
import type { CurrentUser } from './authApi'

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
}
export const getAccountSettings = () => apiGet<AccountSettings>('/api/auth/settings')
export const saveDisplayName = (displayName: string, version: string) =>
  apiPut<AccountSettings>('/api/auth/profile', { displayName, version })
export const changePassword = (currentPassword: string, newPassword: string) =>
  apiPost<void>('/api/auth/change-password', { currentPassword, newPassword })
