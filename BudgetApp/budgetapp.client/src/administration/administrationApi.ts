import { apiGet, apiPost } from '../api/apiClient'
import type { VerificationChallenge, VerificationProof } from '../auth/loginVerificationApi'

export type AdministrativeAction = 'PasswordResetEmail' | 'MfaRecoveryEmail' | 'RevokeSessions' | 'GrantOwnerAccess' | 'GrantSupportAccess' | 'RemoveAdministratorAccess'
export type AdministratorRole = 'InstallationOwner' | 'SupportAdministrator'
export interface AdministrativeAccount {
  id: string; displayName: string; email: string; emailConfirmed: boolean; mfaEnabled: boolean
  lockedUntilUtc: string | null; version: string; isApplicationAdministrator: boolean
  administratorRole?: AdministratorRole | null; administratorVersion?: string | null
}
export interface AdministrativeRequest {
  operationId: string; targetUserId: string; action: AdministrativeAction; reason: string; version: string; currentPassword: string
  grantVersion?: string | null
}
export interface AdministrativeResult { operationId: string; outcome: string; message: string }
export interface AdministrativeAuditItem {
  id: string; actorUserId: string; targetUserId: string; action: string; reason: string; outcome: string; occurredAtUtc: string
}
export interface AdministrativeAudit { items: AdministrativeAuditItem[]; totalCount: number; page: number; pageSize: number }
export interface AdministratorList { items: AdministrativeAccount[]; totalCount: number; page: number; pageSize: number }
export const getApplicationUsers = (page = 1, search = '') => apiGet<AdministratorList>(`/api/admin/users?${new URLSearchParams({ page: String(page), search })}`)
export const getApplicationAdministrators = (page = 1) => apiGet<AdministratorList>(`/api/admin/administrators?page=${page}`)
export const searchAdministrativeAccounts = (search: string) => apiGet<{ items: AdministrativeAccount[] }>(`/api/admin/accounts?${new URLSearchParams({ search })}`)
export const getAdministrativeAccount = (id: string) => apiGet<AdministrativeAccount>(`/api/admin/accounts/${encodeURIComponent(id)}`)
export const getAdministrativeAudit = (page = 1) => apiGet<AdministrativeAudit>(`/api/admin/audit?page=${page}`)
export const prepareAdministrativeAction = (request: AdministrativeRequest) => apiPost<VerificationChallenge>('/api/admin/actions/prepare', request)
export const resendAdministrativeCode = (request: AdministrativeRequest, challengeId: string) => apiPost<VerificationChallenge>('/api/admin/actions/resend', { request, challengeId })
export const completeAdministrativeAction = (request: AdministrativeRequest, proof: VerificationProof) => apiPost<AdministrativeResult>('/api/admin/actions/complete', { request, proof })
export const getAdministrativeResult = (id: string) => apiGet<AdministrativeResult>(`/api/admin/actions/${encodeURIComponent(id)}`)
export const completeOperatorMfaRecovery = (userId: string, token: string, currentPassword: string) =>
  apiPost<{ recoveryCodes: string[] }>('/api/auth/operator-mfa-recovery', { userId, token, currentPassword })
