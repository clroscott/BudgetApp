import { apiGet } from '../api/apiClient'
import type { BudgetScope } from '../budgets/budgetApi'
import type { TransactionQuery } from '../transactions/transactionApi'

export interface DashboardBudgetSummary {
  id: string | null
  year: number
  month: number
  scope: BudgetScope
  currency: string
  status: string | null
  budgetedAmount: number
  actualAmount: number
  remainingAmount: number
  uncategorizedActualAmount: number
  currencyMismatchTransactionCount: number
}

export interface DashboardRecentTransaction {
  id: string
  accountName: string
  currency: string
  transactionDate: string
  amount: number
  description: string
}

export interface DashboardSnapshot {
  budget: DashboardBudgetSummary
  readyForReviewCount: number
  uncategorizedSpendingCount: number
  hasActiveAccount: boolean
  hasVisibleTransactions: boolean
  recent: DashboardRecentTransaction[] | null
}

export function dashboardPeriod(timeZoneId: string, now = new Date()) {
  const options: Intl.DateTimeFormatOptions = { timeZone: timeZoneId, year: 'numeric', month: '2-digit' }
  let formatter: Intl.DateTimeFormat
  try { formatter = new Intl.DateTimeFormat('en-CA', options) }
  catch { formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' }) }
  const parts = formatter.formatToParts(now)
  return `${parts.find(part => part.type === 'year')!.value.padStart(4, '0')}-${parts.find(part => part.type === 'month')!.value}`
}

export function dashboardQuery(period: string, scope: BudgetScope, currency: string): TransactionQuery {
  const [year, month] = period.split('-').map(Number)
  const end = new Date(0)
  end.setUTCFullYear(year, month, 0)
  return { page: 1, budgetInclusion: scope, currency, spendingOnly: true,
    fromDate: `${period}-01`, toDate: `${period}-${String(end.getUTCDate()).padStart(2, '0')}` }
}

export function dashboardTransactionsLink(period: string, scope: BudgetScope, currency: string, uncategorized = false) {
  const query = dashboardQuery(period, scope, currency)
  const params = new URLSearchParams({ fromDate: query.fromDate!, toDate: query.toDate!,
    budgetInclusion: scope, currency, spendingOnly: 'true' })
  if (uncategorized) params.set('uncategorizedOnly', 'true')
  return `/transactions?${params}`
}

export function dashboardBudgetLink(period: string, scope: BudgetScope) {
  const [year, month] = period.split('-').map(Number)
  return `/budgeting?${new URLSearchParams({ year: String(year), month: String(month), scope })}`
}

export async function readDashboardSnapshot(householdId: string, period: string, scope: BudgetScope, includeRecent = false): Promise<DashboardSnapshot> {
  const [year, month] = period.split('-').map(Number)
  const query = new URLSearchParams({ year: String(year), month: String(month), scope })
  if (includeRecent) query.set('includeRecent', 'true')
  return apiGet<DashboardSnapshot>(`/api/households/${encodeURIComponent(householdId)}/dashboard-summary?${query}`)
}
