import { apiGet, apiPost } from '../api/apiClient'
import type { HouseholdMembership } from './householdApi'

export type HouseholdInvitationRole = 'Admin' | 'Editor' | 'Viewer'

export interface HouseholdMemberItem {
  userId: string
  displayName: string
  email: string
  role: string
  status: string
  joinedAtUtc: string | null
}

export interface HouseholdInvitationItem {
  id: string
  email: string
  role: HouseholdInvitationRole
  status: string
  createdAtUtc: string
  lastSentAtUtc: string
  expiresAtUtc: string
}

export interface HouseholdMemberManagement {
  canManageInvitations: boolean
  members: HouseholdMemberItem[]
  invitations: HouseholdInvitationItem[]
  exitOptions: {
    canLeave: boolean
    canDeleteUnused: boolean
    blockedReason: string | null
  }
}

export interface HouseholdInvitationDispatch {
  invitation: HouseholdInvitationItem
  emailDelivered: boolean
}

export interface HouseholdInvitationPreview {
  householdName: string
  inviterDisplayName: string
  maskedEmail: string
  role: HouseholdInvitationRole
  expiresAtUtc: string
  isAvailable: boolean
  status: string
}

export function getHouseholdMembers(
  householdId: string,
): Promise<HouseholdMemberManagement> {
  return apiGet<HouseholdMemberManagement>(
    `/api/households/${householdId}/members`,
  )
}

export function createHouseholdInvitation(
  householdId: string,
  request: { email: string, role: HouseholdInvitationRole },
): Promise<HouseholdInvitationDispatch> {
  return apiPost<HouseholdInvitationDispatch>(
    `/api/households/${householdId}/invitations`,
    request,
  )
}

export function resendHouseholdInvitation(
  householdId: string,
  invitationId: string,
): Promise<HouseholdInvitationDispatch> {
  return apiPost<HouseholdInvitationDispatch>(
    `/api/households/${householdId}/invitations/${invitationId}/resend`,
    {},
  )
}

export function revokeHouseholdInvitation(
  householdId: string,
  invitationId: string,
): Promise<void> {
  return apiPost<void>(
    `/api/households/${householdId}/invitations/${invitationId}/revoke`,
    {},
  )
}

export function getHouseholdInvitationPreview(
  token: string,
): Promise<HouseholdInvitationPreview> {
  return apiGet<HouseholdInvitationPreview>(
    `/api/household-invitations/preview?token=${encodeURIComponent(token)}`,
  )
}

export function acceptHouseholdInvitation(
  token: string,
): Promise<HouseholdMembership> {
  return apiPost<HouseholdMembership>(
    '/api/household-invitations/accept',
    { token },
  )
}
