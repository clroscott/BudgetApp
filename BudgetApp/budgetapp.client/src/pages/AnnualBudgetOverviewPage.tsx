import { useEffect, useState, type CSSProperties } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import {
  getAnnualBudgetOverview,
  type AnnualBudgetCategory,
  type AnnualBudgetOverview,
} from '../budgets/annualBudgetOverviewApi'
import type { BudgetScope } from '../budgets/budgetApi'
import { BrandLockup } from '../components/Brand'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'short' })
    .format(new Date(2020, index, 1)))

function dateRange(year: number, month?: number) {
  const from = month
    ? `${year}-${String(month).padStart(2, '0')}-01`
    : `${year}-01-01`
  const lastMonth = month ?? 12
  const toDate = new Date(year, lastMonth, 0)
  const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1)
    .padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`
  return { from, to }
}

function transactionLink(year: number, categoryId?: string, month?: number) {
  const range = dateRange(year, month)
  const search = new URLSearchParams({
    fromDate: range.from,
    toDate: range.to,
  })
  if (categoryId) search.set('categoryId', categoryId)
  return `/transactions?${search}`
}

export function AnnualBudgetOverviewPage() {
  const { currentHousehold } = useHouseholds()
  const [year, setYear] = useState(new Date().getFullYear())
  const [scope, setScope] = useState<BudgetScope>('Household')
  const [overview, setOverview] = useState<AnnualBudgetOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!currentHousehold) return
    let isCurrent = true
    setIsLoading(true)
    setErrors([])
    void getAnnualBudgetOverview(currentHousehold.id, year, scope)
      .then(result => {
        if (isCurrent) setOverview(result)
      })
      .catch(error => {
        if (!isCurrent) return
        setOverview(null)
        setErrors(getErrorMessages(error))
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [currentHousehold, scope, year])

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

      <ErrorSummary errors={errors} />
      {isLoading || !overview ? (
        <p className="empty-state">Loading annual overview…</p>
      ) : <>
        <section className="annual-summary-grid" aria-label="Annual summary">
          <Summary label="Budgeted" value={formatAmount(overview.annualBudgetedAmount)}
            detail={`${overview.budgetedMonthCount} of 12 months have budgets`} />
          <Summary label="Actual spending" value={formatAmount(overview.actualSpendingAmount)}
            link={transactionLink(year)} detail="Official, budget-included transactions" />
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
            detail="Income minus spending" />
        </section>

        {overview.uncategorizedSpendingAmount !== 0 &&
          <p className="budget-actual-warning">
            <strong>{formatAmount(overview.uncategorizedSpendingAmount)} uncategorized</strong>
            {' '}is included in spending totals but not in a category row.{' '}
            <AppLink to={`${transactionLink(year)}&uncategorizedOnly=true`}>
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
                  <AppLink to={transactionLink(year, undefined, month.month)}>
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
                  year={year}
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
  formatAmount,
  depth = 0,
}: {
  category: AnnualBudgetCategory
  year: number
  formatAmount: (amount: number) => string
  depth?: number
}) {
  const row = (
    <div className={`annual-category-row ${depth > 0 ? 'annual-category-child' : 'annual-category-parent'}`}>
      <span style={{ '--category-depth': depth } as CSSProperties}>
        <AppLink to={transactionLink(year, category.id)}>{category.name}</AppLink>
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
