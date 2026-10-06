import type { BudgetScope } from './budgetApi'

export function transactionLink(year: number, scope: BudgetScope, currency: string, categoryId?: string, month?: number) {
  const yearText = String(year).padStart(4, '0')
  const from = `${yearText}-${String(month ?? 1).padStart(2, '0')}-01`
  // UTC and setUTCFullYear also handle years 1–99 without Date's 1900 offset.
  const lastDay = new Date(0)
  lastDay.setUTCFullYear(year, month ?? 12, 0)
  const to = `${yearText}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`
  const search = new URLSearchParams({ budgetInclusion: scope, currency,
    spendingOnly: 'true', fromDate: from, toDate: to })
  if (categoryId) search.set('categoryId', categoryId)
  return `/transactions?${search}`
}
