import { apiGet, apiPost, apiPut } from '../api/apiClient'
import type { BudgetScope } from './budgetApi'

export interface YearlyTargetCategory {
  id: string
  name: string
  isActive: boolean
  annualTargetAmount: number | null
  equivalentMonthlyAmount: number | null
  children: YearlyTargetCategory[]
}

export interface YearlyPlanData {
  id: string | null
  fiscalYearStartYear: number
  fiscalYearStartMonth: number
  householdDefaultFiscalYearStartMonth: number
  scope: BudgetScope
  currency: string
  startsOn: string
  endsOn: string
  updatedAtUtc: string | null
  categories: YearlyTargetCategory[]
}

export interface YearlyAllocationResult {
  createdCount: number
  replacedDraftCount: number
  skippedCount: number
  months: {
    year: number
    month: number
    result: string
    budgetId: string | null
  }[]
}

const planPath = (householdId: string, year: number) =>
  `/api/households/${householdId}/yearly-plans/${year}`

export function getYearlyPlan(
  householdId: string,
  year: number,
  scope: BudgetScope,
): Promise<YearlyPlanData> {
  return apiGet(`${planPath(householdId, year)}?scope=${scope}`)
}

export function saveYearlyPlan(
  householdId: string,
  year: number,
  scope: BudgetScope,
  fiscalYearStartMonth: number,
  lines: { categoryId: string, annualTargetAmount: number }[],
): Promise<YearlyPlanData> {
  return apiPut(planPath(householdId, year), {
    scope,
    fiscalYearStartMonth,
    lines,
  })
}

export function changeFiscalYearStartMonth(
  householdId: string,
  fiscalYearStartMonth: number,
): Promise<{ fiscalYearStartMonth: number }> {
  return apiPut(
    `/api/households/${householdId}/yearly-plans/default-start-month`,
    { fiscalYearStartMonth },
  )
}

export function allocateYearlyPlan(
  householdId: string,
  year: number,
  scope: BudgetScope,
  selected: { year: number, month: number }[],
  replaceExistingDrafts: boolean,
): Promise<YearlyAllocationResult> {
  return apiPost(`${planPath(householdId, year)}/allocate`, {
    scope,
    months: selected,
    replaceExistingDrafts,
  })
}
