import type { BudgetScope } from '../budgets/budgetApi'
import type { TransactionQuery } from './transactionApi'

// Pagination does not change the set being reconciled with the report.
export function transactionFilterKey(query: TransactionQuery) {
  return JSON.stringify({
    account: query.accountId ?? '',
    from: query.fromDate ?? '',
    to: query.toDate ?? '',
    categoryType: query.categoryType ?? '',
    category: query.categoryId ?? '',
    uncategorized: !!query.uncategorizedOnly,
    description: query.description ?? '',
    inclusion: query.budgetInclusion ?? '',
    currency: query.currency ?? '',
    spending: !!query.spendingOnly,
  })
}

export function readAnnualReportContext(search: string, query: TransactionQuery) {
  const parameters = new URLSearchParams(search)
  const year = Number(parameters.get('reportYear'))
  const householdId = parameters.get('reportHouseholdId')
  const scope = query.budgetInclusion
  const yearText = String(year).padStart(4, '0')
  if (parameters.get('report') !== 'annual-overview' || !householdId ||
      !Number.isInteger(year) || year < 1 || year > 9999 ||
      !query.currency || !query.spendingOnly ||
      !query.fromDate?.startsWith(`${yearText}-`) ||
      !query.toDate?.startsWith(`${yearText}-`) || query.fromDate > query.toDate ||
      (scope !== 'Household' && scope !== 'Personal')) return null

  return { year, scope: scope as BudgetScope, householdId, query }
}

export function annualReportReturnLink(year: number, scope: BudgetScope) {
  return `/budgeting/annual-overview?${new URLSearchParams({ year: String(year), scope })}`
}
