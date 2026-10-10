import { useEffect, useMemo, useState } from 'react'
import {
  getAnnualBudgetOverview,
  type AnnualBudgetOverview,
} from '../budgets/annualBudgetOverviewApi'
import type { BudgetScope } from '../budgets/budgetApi'
import { annualOverviewSelection, transactionLink } from '../budgets/transactionDrilldown'
import { PageFrame } from '../components/PageFrame'
import { AnnualCategoryTable } from '../components/AnnualCategoryTable'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { ContextualHelp } from '../components/ContextualHelp'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'short' })
    .format(new Date(2020, index, 1)))

export function AnnualBudgetOverviewPage() {
  const { currentHousehold } = useHouseholds()
  const { search, navigate } = useRouter()
  const { year, scope } = useMemo(() => annualOverviewSelection(search), [search])
  const [yearInput, setYearInput] = useState(String(year))
  useEffect(() => { setYearInput(String(year)) }, [search, year])
  const choosePeriod = (nextYear: number, nextScope: BudgetScope, replace = false) =>
    navigate(`/budgeting/annual-overview?${new URLSearchParams({ year: String(nextYear), scope: nextScope })}`, { replace })
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

  return <PageFrame contentClassName="annual-overview-content">
      <BudgetingSectionNav current="annual-overview" />
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

      <section className="panel annual-overview-controls">
        <label>
          <span>Calendar year</span>
          <input
            type="number"
            min="1"
            max="9999"
            value={yearInput}
            onChange={event => {
              setYearInput(event.target.value)
              const nextYear = Number(event.target.value)
              if (Number.isInteger(nextYear) && nextYear >= 1 && nextYear <= 9999) choosePeriod(nextYear, scope, true)
            }}
          />
        </label>
        <label>
          <span>Scope</span>
          <select
            value={scope}
            onChange={event => choosePeriod(year, event.target.value as BudgetScope)}
          >
            <option value="Household">Household</option>
            <option value="Personal">Personal</option>
          </select>
        </label>
      </section>

      <div className="contextual-help-row">
        <ContextualHelp topic="scope-privacy" />
        <ContextualHelp topic="budget-states" />
      </div>
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
            <AnnualCategoryTable categories={overview.categories} year={overview.year}
              scope={overview.scope} currency={overview.currency} householdId={currentHousehold.id}
              formatAmount={formatAmount} />
          )}
        </section>
      </>}
  </PageFrame>
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
