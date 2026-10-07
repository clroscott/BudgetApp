import { apiGet, apiPost } from '../api/apiClient'
import type { CurrentUser } from './authApi'

export type SecurityPurpose = 'Enable' | 'Disable' | 'RecoveryCodes' | 'ChangePassword' | 'ChangeEmail'
export interface VerificationChallenge {
  challengeId: string
  expiresAtUtc: string
  resendAtUtc: string
  challengeExpiresAtUtc: string
  delivered: boolean
}
export interface VerificationProof { challengeId: string; code: string; useRecoveryCode: boolean }
export interface VerificationStatus { emailEnabled: boolean; recoveryCodesRemaining: number }
export interface VerificationResult { user: CurrentUser; verification: VerificationStatus; recoveryCodes: string[] | null }
export interface PendingLogin { requiresVerification: true; challenge: VerificationChallenge }
export function isPendingLogin(value: CurrentUser | PendingLogin): value is PendingLogin {
  return 'requiresVerification' in value && value.requiresVerification
}
export const getPendingLogin = () => apiGet<{ challenge: VerificationChallenge | null }>('/api/auth/verification/pending')
export const completeLogin = (proof: VerificationProof) => apiPost<CurrentUser>('/api/auth/verification/login', proof)
export const resendLoginCode = (challengeId: string) => apiPost<VerificationChallenge>('/api/auth/verification/resend-login', { challengeId })
export const cancelPendingLogin = () => apiPost<void>('/api/auth/verification/cancel-login', {})
export const requestSecurityCode = (purpose: SecurityPurpose, currentPassword: string) =>
  apiPost<VerificationChallenge>('/api/auth/verification/challenge', { purpose, currentPassword })
export const resendSecurityCode = (purpose: SecurityPurpose, challengeId: string) =>
  apiPost<VerificationChallenge>('/api/auth/verification/resend', { purpose, challengeId })
export const manageVerification = (purpose: 'Enable' | 'Disable' | 'RecoveryCodes', currentPassword: string, proof: VerificationProof) =>
  apiPost<VerificationResult>(`/api/auth/verification/${purpose === 'Enable' ? 'enable' : purpose === 'Disable' ? 'disable' : 'recovery-codes'}`, { currentPassword, proof })
