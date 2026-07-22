import { apiGet, apiPost } from '../api/apiClient'

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
