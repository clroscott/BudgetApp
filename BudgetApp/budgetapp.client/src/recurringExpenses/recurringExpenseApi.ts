import { apiGet, apiPost, apiPut } from '../api/apiClient'

export type RecurringExpenseScope = 'Household' | 'Personal'

export interface RecurringExpenseItem {
  id: string
  name: string
  amount: number
  currency: string
  scope: RecurringExpenseScope
  ownerUserId: string | null
  subcategoryId: string
  categoryName: string
  subcategoryName: string
  accountId: string | null
  accountName: string | null
  expectedDayOfMonth: number | null
  startsOn: string
  endsOn: string | null
  isActive: boolean
}

export interface RecurringExpenseRequest {
  name: string
  amount: number
  scope: RecurringExpenseScope
  subcategoryId: string
  accountId?: string | null
  expectedDayOfMonth?: number | null
  startsOn: string
  endsOn?: string | null
}

const path = (householdId: string) =>
  `/api/households/${householdId}/recurring-expenses`

export function getRecurringExpenses(householdId: string): Promise<RecurringExpenseItem[]> {
  return apiGet(path(householdId))
}

export function createRecurringExpense(
  householdId: string,
  request: RecurringExpenseRequest,
): Promise<{ id: string }> {
  return apiPost(path(householdId), request)
}

export function updateRecurringExpense(
  householdId: string,
  recurringExpenseId: string,
  request: RecurringExpenseRequest,
): Promise<void> {
  return apiPut(`${path(householdId)}/${recurringExpenseId}`, request)
}

export function setRecurringExpenseActive(
  householdId: string,
  recurringExpenseId: string,
  isActive: boolean,
): Promise<void> {
  return apiPost(
    `${path(householdId)}/${recurringExpenseId}/${isActive ? 'reactivate' : 'deactivate'}`,
    {},
  )
}
