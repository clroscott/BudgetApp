import { apiGet } from '../api/apiClient'
import type { BudgetScope, BudgetStatus } from './budgetApi'

export interface AnnualBudgetMonth {
  budgetId: string | null
  year: number
  month: number
  status: BudgetStatus | null
  budgetedAmount: number | null
  actualSpendingAmount: number
  remainingAmount: number | null
  incomeAmount: number
  netCashFlowAmount: number
}

export interface AnnualBudgetCategory {
  id: string
  name: string
  isActive: boolean
  budgetedAmount: number | null
  actualAmount: number
  remainingAmount: number | null
  averageActualPerMonth: number
  directActualAmount: number
  children: AnnualBudgetCategory[]
}

export interface AnnualBudgetOverview {
  year: number
  scope: BudgetScope
  currency: string
  actualAverageMonthCount: number
  budgetedMonthCount: number
  annualBudgetedAmount: number
  actualSpendingAmount: number
  remainingAmount: number | null
  incomeAmount: number
  netCashFlowAmount: number
  uncategorizedSpendingAmount: number
  currencyMismatchTransactionCount: number
  months: AnnualBudgetMonth[]
  categories: AnnualBudgetCategory[]
}

export function getAnnualBudgetOverview(
  householdId: string,
  year: number,
  scope: BudgetScope,
): Promise<AnnualBudgetOverview> {
  return apiGet(
    `/api/households/${householdId}/annual-budget-overview/${year}?scope=${scope}`,
  )
}
