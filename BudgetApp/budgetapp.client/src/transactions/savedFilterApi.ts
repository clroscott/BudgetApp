import { apiDelete, apiGet, apiPut } from '../api/apiClient'
import type { TransactionFilters } from './transactionFilters'

export interface SavedTransactionFilter {
  id: string
  name: string
  filters: TransactionFilters
  version: string
  unavailableReferences: string[]
}
function path(householdId: string, id?: string) {
  return `/api/households/${encodeURIComponent(householdId)}/transaction-filters${id ? `/${encodeURIComponent(id)}` : ''}`
}
export function getSavedFilters(householdId: string): Promise<SavedTransactionFilter[]> {
  return apiGet(path(householdId))
}
export function checkSavedFilter(householdId: string, id: string): Promise<SavedTransactionFilter> {
  return apiGet(path(householdId, id))
}
export function saveFilter(householdId: string, id: string, name: string, filters: TransactionFilters): Promise<SavedTransactionFilter> {
  return apiPut(path(householdId, id), { name, filters })
}
export function renameFilter(householdId: string, item: SavedTransactionFilter, name: string): Promise<SavedTransactionFilter> {
  return apiPut(`${path(householdId, item.id)}/name`, { name, version: item.version })
}
export function deleteFilter(householdId: string, item: SavedTransactionFilter): Promise<void> {
  return apiDelete(`${path(householdId, item.id)}?${new URLSearchParams({ version: item.version })}`)
}
