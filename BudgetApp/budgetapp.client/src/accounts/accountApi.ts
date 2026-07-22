import { apiGet, apiPost, apiPut } from '../api/apiClient'

export type AccountType = 'Chequing' | 'Savings' | 'CreditCard' | 'Cash' | 'Other'
export type AccountScope = 'Household' | 'Personal'

export interface AccountItem {
  id: string
  name: string
  type: AccountType
  scope: AccountScope
  ownerUserId: string | null
  currency: string
  institutionName: string | null
  lastFourDigits: string | null
  isActive: boolean
}

export interface CreateAccountRequest {
  name: string
  type: AccountType
  scope: AccountScope
  currency: string
  institutionName?: string
  lastFourDigits?: string
}

export interface UpdateAccountRequest {
  name: string
  type: AccountType
  scope: AccountScope
  currency: string
  institutionName?: string
  lastFourDigits?: string
}

export function getAccounts(householdId: string): Promise<AccountItem[]> {
  return apiGet<AccountItem[]>(`/api/households/${householdId}/accounts`)
}

export function createAccount(
  householdId: string,
  request: CreateAccountRequest,
): Promise<{ id: string }> {
  return apiPost(`/api/households/${householdId}/accounts`, request)
}

export function updateAccount(
  householdId: string,
  accountId: string,
  request: UpdateAccountRequest,
): Promise<void> {
  return apiPut(`/api/households/${householdId}/accounts/${accountId}`, request)
}

export function setAccountActive(
  householdId: string,
  accountId: string,
  isActive: boolean,
): Promise<void> {
  const action = isActive ? 'reactivate' : 'archive'
  return apiPost(
    `/api/households/${householdId}/accounts/${accountId}/${action}`,
    {},
  )
}
