import { apiDelete, apiGet, apiPost, apiPut } from '../api/apiClient'

export type BudgetScope = 'Household' | 'Personal'
export type BudgetStatus = 'Draft' | 'Active' | 'Closed'

export interface BudgetCategory {
  id: string
  name: string
  isActive: boolean
  budgetedAmount: number | null
  children: BudgetCategory[]
}

export interface BudgetPageData {
  id: string | null
  year: number
  month: number
  scope: BudgetScope
  currency: string
  status: BudgetStatus | null
  updatedAtUtc: string | null
  categories: BudgetCategory[]
}

export interface BudgetMonthOption {
  id: string
  year: number
  month: number
  status: BudgetStatus
}

const periodPath = (householdId: string, year: number, month: number) =>
  `/api/households/${householdId}/budgets/${year}/${month}`

export function getBudget(
  householdId: string,
  year: number,
  month: number,
  scope: BudgetScope,
): Promise<BudgetPageData> {
  return apiGet(`${periodPath(householdId, year, month)}?scope=${scope}`)
}

export function createBudget(
  householdId: string,
  year: number,
  month: number,
  scope: BudgetScope,
): Promise<BudgetPageData> {
  return apiPost(periodPath(householdId, year, month), { scope })
}

export function getBudgetMonthOptions(
  householdId: string,
  scope: BudgetScope,
): Promise<BudgetMonthOption[]> {
  return apiGet(`/api/households/${householdId}/budgets?scope=${scope}`)
}

export function copyBudget(
  householdId: string,
  year: number,
  month: number,
  scope: BudgetScope,
  sourceYear: number,
  sourceMonth: number,
): Promise<BudgetPageData> {
  return apiPost(`${periodPath(householdId, year, month)}/copy`, {
    scope,
    sourceYear,
    sourceMonth,
  })
}

export function initializeBudget(
  householdId: string,
  year: number,
  month: number,
  scope: BudgetScope,
  method: 'from-recurring',
): Promise<BudgetPageData> {
  return apiPost(`${periodPath(householdId, year, month)}/${method}`, { scope })
}

export function deleteDraftBudget(
  householdId: string,
  budgetId: string,
): Promise<void> {
  return apiDelete(`/api/households/${householdId}/budgets/${budgetId}`)
}

export function saveBudget(
  householdId: string,
  budgetId: string,
  lines: { categoryId: string, budgetedAmount: number }[],
): Promise<BudgetPageData> {
  return apiPut(`/api/households/${householdId}/budgets/${budgetId}`, { lines })
}

export function changeBudgetStatus(
  householdId: string,
  budgetId: string,
  action: 'activate' | 'close' | 'reopen',
): Promise<BudgetPageData> {
  return apiPost(`/api/households/${householdId}/budgets/${budgetId}/${action}`, {})
}
