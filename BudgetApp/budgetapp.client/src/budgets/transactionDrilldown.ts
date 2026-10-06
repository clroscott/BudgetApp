import type { BudgetScope } from './budgetApi'

export function transactionLink(year: number, scope: BudgetScope, currency: string, categoryId?: string, month?: number, householdId?: string) {
  const yearText = String(year).padStart(4, '0')
  const from = `${yearText}-${String(month ?? 1).padStart(2, '0')}-01`
  // UTC and setUTCFullYear also handle years 1–99 without Date's 1900 offset.
  const lastDay = new Date(0)
  lastDay.setUTCFullYear(year, month ?? 12, 0)
  const to = `${yearText}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`
  const search = new URLSearchParams({ budgetInclusion: scope, currency,
    spendingOnly: 'true', fromDate: from, toDate: to })
  if (categoryId) search.set('categoryId', categoryId)
  if (householdId) {
    search.set('report', 'annual-overview')
    search.set('reportYear', String(year))
    search.set('reportHouseholdId', householdId)
  }
  return `/transactions?${search}`
}

export function annualOverviewSelection(search: string) {
  const params = new URLSearchParams(search)
  const requestedYear = Number(params.get('year'))
  return {
    year: Number.isInteger(requestedYear) && requestedYear >= 1 && requestedYear <= 9999
      ? requestedYear : new Date().getFullYear(),
    scope: params.get('scope') === 'Personal' ? 'Personal' as const : 'Household' as const,
  }
}
