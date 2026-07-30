import { apiDelete, apiGet, apiPost } from '../api/apiClient'

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

export function getHouseholds(): Promise<HouseholdMembership[]> {
  return apiGet<HouseholdMembership[]>('/api/households')
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
