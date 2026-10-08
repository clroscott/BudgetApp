import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getBudget, type BudgetPageData, type BudgetScope } from '../budgets/budgetApi'
import { getImports, type ImportListItem } from '../imports/importApi'
import { getTransactions, type TransactionListResult, type TransactionQuery } from '../transactions/transactionApi'

export interface DashboardSnapshot {
  budget: BudgetPageData
  accounts: AccountItem[]
  imports: ImportListItem[]
  recent: TransactionListResult
  uncategorized: TransactionListResult
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

// Match the existing monthly budget: detailed child lines replace a parent
// line, and parent actuals already contain their children's actuals. Do not
// double-count children or add Personal and Household views together.
export function budgetSnapshotTotals(budget: BudgetPageData) {
  const budgeted = budget.categories.reduce((sum, root) => sum + (root.children.some(child => child.budgetedAmount !== null)
    ? root.children.reduce((subtotal, child) => subtotal + (child.budgetedAmount ?? 0), 0)
    : root.budgetedAmount ?? 0), 0)
  const actual = budget.categories.reduce((sum, root) => sum + root.actualAmount, 0)
  return { budgeted, actual, remaining: budgeted - actual }
}

export async function readDashboardSnapshot(householdId: string, period: string, scope: BudgetScope): Promise<DashboardSnapshot> {
  const [year, month] = period.split('-').map(Number)
  const [budget, accounts, imports, recent] = await Promise.all([
    getBudget(householdId, year, month, scope), getAccounts(householdId), getImports(householdId),
    getTransactions(householdId, { page: 1 }),
  ])
  const uncategorized = await getTransactions(householdId, { ...dashboardQuery(period, scope, budget.currency), uncategorizedOnly: true })
  return { budget, accounts, imports, recent, uncategorized }
}
