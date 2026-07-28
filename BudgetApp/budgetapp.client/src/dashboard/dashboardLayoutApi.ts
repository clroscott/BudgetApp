import { apiDelete, apiGet, apiPut } from '../api/apiClient'

export interface DashboardLayout {
  preferredColumnCount: number
  visiblePanelKeys: string[]
  isDefault: boolean
}

export interface SaveDashboardLayoutRequest {
  preferredColumnCount: number
  visiblePanelKeys: string[]
}

function path(householdId: string): string {
  return `/api/households/${householdId}/dashboard-layout`
}

export function getDashboardLayout(householdId: string): Promise<DashboardLayout> {
  return apiGet<DashboardLayout>(path(householdId))
}

export function saveDashboardLayout(
  householdId: string,
  request: SaveDashboardLayoutRequest,
): Promise<DashboardLayout> {
  return apiPut<DashboardLayout>(path(householdId), request)
}

export async function resetDashboardLayout(
  householdId: string,
): Promise<DashboardLayout> {
  await apiDelete(path(householdId))
  return getDashboardLayout(householdId)
}
