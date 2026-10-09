import type { BudgetScope } from '../budgets/budgetApi'
import { dashboardBudgetLink, dashboardTransactionsLink, type DashboardSnapshot } from '../dashboard/dashboardSnapshot'
import { AppLink } from '../routing/AppLink'

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
}

export function DashboardLivePanel({ panelKey, snapshot, period, scope, canManage, loading }: {
  panelKey: string, snapshot: DashboardSnapshot | null, period: string, scope: BudgetScope, canManage: boolean, loading: boolean,
}) {
  if (panelKey === 'quick-actions') return <>
    <p>Pick up a common task.</p>
    {canManage && <AppLink to="/import">Import transactions</AppLink>}
    <AppLink to="/transactions">View transactions</AppLink>
    <AppLink to={dashboardBudgetLink(period, scope)}>{canManage ? 'Manage' : 'View'} monthly budget</AppLink>
    <AppLink to="/accounts">View financial accounts</AppLink>
  </>
  if (!snapshot) return <p>{loading ? 'Loading this summary…' : 'Summary data is unavailable. Use Retry loading above to try again.'}</p>
  const { budget } = snapshot
  if (panelKey === 'financial-overview') {
    const totals = { budgeted: budget.budgetedAmount, actual: budget.actualAmount, remaining: budget.remainingAmount }
    return <>
      <p className="dashboard-card-context">{scope} · {period} · {budget.currency}{budget.status && ` · ${budget.status} budget`}</p>
      {budget.id ? <dl className="dashboard-metrics">
        <div><dt>Budgeted</dt><dd>{formatAmount(totals.budgeted, budget.currency)}</dd></div>
        <div><dt>Actual</dt><dd>{formatAmount(totals.actual, budget.currency)}</dd></div>
        <div><dt>Remaining</dt><dd>{formatAmount(totals.remaining, budget.currency)}</dd></div>
      </dl> : <p>No saved {scope.toLowerCase()} budget for this month. Your transactions are kept independently.</p>}
      {budget.id && totals.remaining < 0 && <p className="dashboard-warning">Over budget by {formatAmount(-totals.remaining, budget.currency)}.</p>}
      <p className="field-help">Matches the monthly budget’s categorized actuals; this is not your bank balance.</p>
      {budget.uncategorizedActualAmount !== 0 && <p className="dashboard-warning">{formatAmount(budget.uncategorizedActualAmount, budget.currency)} of uncategorized spending is outside category totals.</p>}
      {budget.currencyMismatchTransactionCount > 0 && <p className="dashboard-warning">{budget.currencyMismatchTransactionCount} transaction(s) use another currency and are not converted into this total.</p>}
      <AppLink to={dashboardBudgetLink(period, scope)}>View monthly budget</AppLink>
      <AppLink to={dashboardTransactionsLink(period, scope, budget.currency)}>View spending for this month</AppLink>
    </>
  }
  if (panelKey === 'needs-attention') {
    const pending = snapshot.readyForReviewCount
    return <>
      <ul className="dashboard-attention-list">
        <li><strong>{pending}</strong><AppLink to="/imports/review?filter=ready">Imports awaiting review</AppLink><small>All visible imports, across months and scopes.</small></li>
        <li><strong>{snapshot.uncategorizedSpendingCount}</strong><AppLink to={dashboardTransactionsLink(period, scope, budget.currency, true)}>Uncategorized spending</AppLink><small>{scope} · {period} · {budget.currency}</small></li>
      </ul>
      {pending === 0 && snapshot.uncategorizedSpendingCount === 0 && <p>No items in these checks need attention.</p>}
      {!canManage && <p className="field-help">Shared-account imports need a member with editing access. You can still review imports from your own personal accounts.</p>}
    </>
  }
  if (panelKey === 'recent-transactions') return <>
    <p className="field-help">Latest visible records across scopes and currencies; amounts are not combined.</p>
    {snapshot.recent === null ? <p>Recent transactions are unavailable. Use Refresh data above to try again.</p>
      : snapshot.recent.length === 0 ? <p>No visible transactions yet.</p> : <ul className="dashboard-recent-list">
      {snapshot.recent.map(item => <li key={item.id}><div><strong>{item.description}</strong><small>{item.transactionDate.slice(0, 10)} · {item.accountName}</small></div><span>{formatAmount(item.amount, item.currency)}</span></li>)}
    </ul>}
    <AppLink to="/transactions">View transactions</AppLink>
  </>
  return null
}
