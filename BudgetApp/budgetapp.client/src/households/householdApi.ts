import { apiDelete, apiGet, apiPost, apiPut } from '../api/apiClient'

export interface HouseholdMembership {
  id: string
  name: string
  defaultCurrency: string
  timeZoneId: string
  role: string
}

export interface CreateHouseholdRequest {
  name: string
  defaultCurrency: string
  timeZoneId: string
}

export interface HouseholdSettings extends CreateHouseholdRequest {
  id: string
  fiscalYearStartMonth: number
  version: string
  canEdit: boolean
  canChangeCurrency: boolean
  currencyLockedReason: string | null
}

export type HouseholdSettingsValues = CreateHouseholdRequest & { fiscalYearStartMonth: number }

export function getHouseholdSettings(householdId: string): Promise<HouseholdSettings> {
  return apiGet(`/api/households/${encodeURIComponent(householdId)}/settings`)
}

export function saveHouseholdSettings(householdId: string, request: HouseholdSettingsValues & { version: string }): Promise<HouseholdSettings> {
  return apiPut(`/api/households/${encodeURIComponent(householdId)}/settings`, request)
}

export function getHouseholds(signal?: AbortSignal): Promise<HouseholdMembership[]> {
  return apiGet<HouseholdMembership[]>('/api/households', signal)
}

export function createHousehold(
  request: CreateHouseholdRequest,
): Promise<HouseholdMembership> {
  return apiPost<HouseholdMembership>('/api/households', request)
}

export function leaveHousehold(householdId: string): Promise<void> {
  return apiPost<void>(`/api/households/${householdId}/leave`, {})
}

export function deleteUnusedHousehold(householdId: string): Promise<void> {
  return apiDelete(`/api/households/${householdId}/unused`)
}
