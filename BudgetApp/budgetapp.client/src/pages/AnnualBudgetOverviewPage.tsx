import { useEffect, useState, type CSSProperties } from 'react'
import {
  getAnnualBudgetOverview,
  type AnnualBudgetCategory,
  type AnnualBudgetOverview,
} from '../budgets/annualBudgetOverviewApi'
import type { BudgetScope } from '../budgets/budgetApi'
import { annualOverviewSelection, transactionLink } from '../budgets/transactionDrilldown'
import { BrandLockup } from '../components/Brand'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'short' })
    .format(new Date(2020, index, 1)))

export function AnnualBudgetOverviewPage() {
  const { currentHousehold } = useHouseholds()
  const [year, setYear] = useState(() => annualOverviewSelection(window.location.search).year)
  const [scope, setScope] = useState<BudgetScope>(() => annualOverviewSelection(window.location.search).scope)
  const [overview, setOverview] = useState<AnnualBudgetOverview | null>(null)
  const loadState = usePageLoad(`${currentHousehold?.id}/${year}/${scope}`)
  const { run } = loadState
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    if (!currentHousehold) return
    void run(() => getAnnualBudgetOverview(currentHousehold.id, year, scope), setOverview)
  }, [currentHousehold, scope, year, run, reloadVersion])

  if (!currentHousehold) return null

  const currency = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: overview?.currency ?? currentHousehold.defaultCurrency,
  })
  const formatAmount = (amount: number) => currency.format(amount)
  const remainingClass = (amount: number | null) =>
    amount !== null && amount < 0 ? 'budget-over' : ''

  return <main className="management-page annual-overview-page">
    <header className="app-header">
      <BrandLockup />
      <AppLink className="header-link" to="/dashboard">Return to dashboard</AppLink>
    </header>
    <section className="management-content annual-overview-content">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Budgeting</p>
          <h1>Annual overview</h1>
          <p>
            Compare monthly budgets with official transactions across the year.
            This report never changes budget data.
            Actuals use each transaction's budget inclusion, not its account ownership.
            Personal and Household totals can overlap; do not add them together.
          </p>
        </div>
      </div>
      <BudgetingSectionNav current="annual-overview" />

      <section className="panel annual-overview-controls">
        <label>
          <span>Calendar year</span>
          <input
            type="number"
            min="1"
            max="9999"
            value={year}
            onChange={event => setYear(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Scope</span>
          <select
            value={scope}
            onChange={event => setScope(event.target.value as BudgetScope)}
          >
            <option value="Household">Household</option>
            <option value="Personal">Personal</option>
          </select>
        </label>
      </section>

      <PageLoadFeedback subject="annual overview" status={loadState.status} errors={loadState.errors}
        onReload={() => setReloadVersion(version => version + 1)} />
      {loadState.hasData && overview && <>
        <section className="annual-summary-grid" aria-label="Annual summary">
          <Summary label="Budgeted" value={formatAmount(overview.annualBudgetedAmount)}
            detail={`${overview.budgetedMonthCount} of 12 months have budgets`} />
          <Summary label="Actual spending" value={formatAmount(overview.actualSpendingAmount)}
            link={transactionLink(overview.year, overview.scope, overview.currency, undefined, undefined, currentHousehold.id)} detail="Official, budget-included transactions" />
          <Summary label="Remaining"
            value={overview.remainingAmount === null
              ? 'No budgets'
              : formatAmount(overview.remainingAmount)}
            className={remainingClass(overview.remainingAmount)}
            detail="Budgeted minus actual spending" />
          <Summary label="Income" value={formatAmount(overview.incomeAmount)}
            detail="Money-in transactions" />
          <Summary label="Net cash flow" value={formatAmount(overview.netCashFlowAmount)}
            className={overview.netCashFlowAmount < 0 ? 'budget-over' : ''}
            detail="Selected budget scope: income minus spending, not an account balance" />
        </section>

        {overview.uncategorizedSpendingAmount !== 0 &&
          <p className="budget-actual-warning">
            <strong>{formatAmount(overview.uncategorizedSpendingAmount)} uncategorized</strong>
            {' '}is included in spending totals but not in a category row.{' '}
            <AppLink to={`${transactionLink(overview.year, overview.scope, overview.currency, undefined, undefined, currentHousehold.id)}&uncategorizedOnly=true`}>
              Review transactions
            </AppLink>
          </p>}
        {overview.currencyMismatchTransactionCount > 0 &&
          <p className="budget-actual-warning">
            {overview.currencyMismatchTransactionCount} transaction
            {overview.currencyMismatchTransactionCount === 1 ? '' : 's'} in another
            currency {overview.currencyMismatchTransactionCount === 1 ? 'is' : 'are'}
            {' '}excluded because currency conversion is not available.
          </p>}

        <section className="panel annual-month-section">
          <div className="annual-section-heading">
            <div>
              <h2>Month by month</h2>
              <p>A missing budget is different from a saved zero-dollar budget.</p>
            </div>
          </div>
          <div className="annual-month-grid">
            {overview.months.map(month => (
              <article className="annual-month-card" key={month.month}>
                <div>
                  <strong>{monthNames[month.month - 1]}</strong>
                  {month.status
                    ? <span className={`budget-status budget-status-${month.status.toLowerCase()}`}>
                        {month.status}
                      </span>
                    : <span className="status-pill">No budget</span>}
                </div>
                <dl>
                  <div><dt>Budgeted</dt><dd>
                    {month.budgetedAmount === null
                      ? 'Missing'
                      : formatAmount(month.budgetedAmount)}
                  </dd></div>
                  <div><dt>Actual</dt><dd>{formatAmount(month.actualSpendingAmount)}</dd></div>
                  <div className={remainingClass(month.remainingAmount)}>
                    <dt>Remaining</dt><dd>
                      {month.remainingAmount === null
                        ? '—'
                        : formatAmount(month.remainingAmount)}
                    </dd>
                  </div>
                </dl>
                <div className="annual-month-links">
                  <AppLink to={`/budgeting?year=${year}&month=${month.month}&scope=${scope}`}>
                    {month.budgetId ? 'Open budget' : 'Budget month'}
                  </AppLink>
                  <AppLink to={transactionLink(overview.year, overview.scope, overview.currency, undefined, month.month, currentHousehold.id)}>
                    Transactions
                  </AppLink>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel annual-category-section">
          <div className="annual-section-heading">
            <div>
              <h2>Category performance</h2>
              <p>
                Average actual uses {overview.actualAverageMonthCount === 0
                  ? 'no elapsed months for this future year'
                  : `${overview.actualAverageMonthCount} elapsed month` +
                    `${overview.actualAverageMonthCount === 1 ? '' : 's'}`}.
              </p>
            </div>
          </div>
          {overview.categories.length === 0 ? (
            <p className="empty-state">No expense categories are available.</p>
          ) : (
            <div className="annual-category-table">
              <div className="annual-category-header" aria-hidden="true">
                <span>Category</span><span>Budgeted</span><span>Actual</span>
                <span>Remaining</span><span>Average / month</span>
              </div>
              {overview.categories.map(category =>
                <CategoryRow
                  key={category.id}
                  category={category}
                  year={overview.year}
                  scope={overview.scope} currency={overview.currency} householdId={currentHousehold.id}
                  formatAmount={formatAmount}
                />)}
            </div>
          )}
        </section>
      </>}
    </section>
  </main>
}

function Summary({
  label,
  value,
  detail,
  link,
  className = '',
}: {
  label: string
  value: string
  detail: string
  link?: string
  className?: string
}) {
  return <article className={`annual-summary-card ${className}`}>
    <span>{label}</span>
    <strong>{link ? <AppLink to={link}>{value}</AppLink> : value}</strong>
    <small>{detail}</small>
  </article>
}

function CategoryRow({
  category,
  year,
  scope, currency, householdId,
  formatAmount,
  depth = 0,
}: {
  category: AnnualBudgetCategory
  year: number
  scope: BudgetScope
  currency: string
  householdId: string
  formatAmount: (amount: number) => string
  depth?: number
}) {
  const row = (
    <div className={`annual-category-row ${depth > 0 ? 'annual-category-child' : 'annual-category-parent'}`}>
      <span style={{ '--category-depth': depth } as CSSProperties}>
        <AppLink to={transactionLink(year, scope, currency, category.id, undefined, householdId)}>{category.name}</AppLink>
        {!category.isActive && <small>Deactivated</small>}
      </span>
      <strong>{category.budgetedAmount === null
        ? 'No budget'
        : formatAmount(category.budgetedAmount)}</strong>
      <strong>{formatAmount(category.actualAmount)}</strong>
      <strong className={
        category.remainingAmount !== null && category.remainingAmount < 0
          ? 'budget-over'
          : ''
      }>{category.remainingAmount === null
          ? '—'
          : formatAmount(category.remainingAmount)}</strong>
      <strong>{formatAmount(category.averageActualPerMonth)}</strong>
    </div>
  )
  const children = category.children.map(child =>
      <CategoryRow
        key={child.id}
        category={child}
        year={year}
        scope={scope} currency={currency} householdId={householdId}
        formatAmount={formatAmount}
        depth={depth + 1}
      />)

  if (depth === 0) {
    return <div className="annual-category-group">
      {row}
      {children}
    </div>
  }

  return <>
    {row}
    {children}
  </>
}
