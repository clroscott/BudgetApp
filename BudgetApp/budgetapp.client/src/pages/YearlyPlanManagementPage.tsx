import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import {
  getBudgetMonthOptions,
  type BudgetMonthOption,
  type BudgetScope,
} from '../budgets/budgetApi'
import {
  allocateYearlyPlan,
  changeFiscalYearStartMonth,
  getYearlyPlan,
  saveYearlyPlan,
  type YearlyPlanData,
} from '../budgets/yearlyPlanApi'
import { BrandLockup } from '../components/Brand'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'

type SectionMode = 'overall' | 'detailed'
type Amounts = Record<string, string>
type Modes = Record<string, SectionMode>

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'long' })
    .format(new Date(2020, index, 1)))

function stateFromPlan(data: YearlyPlanData) {
  const amounts: Amounts = {}
  const modes: Modes = {}
  for (const root of data.categories) {
    if (root.annualTargetAmount !== null) {
      amounts[root.id] = String(root.annualTargetAmount)
    }
    const detailed = root.children.some(child => child.annualTargetAmount !== null)
    modes[root.id] = detailed ? 'detailed' : 'overall'
    for (const child of root.children) {
      if (child.annualTargetAmount !== null) {
        amounts[child.id] = String(child.annualTargetAmount)
      }
    }
  }
  return { amounts, modes }
}

function snapshot(amounts: Amounts) {
  return JSON.stringify(
    Object.entries(amounts).filter(([, value]) => value !== '').sort(),
  )
}

function fiscalMonths(data: YearlyPlanData, startMonth = data.fiscalYearStartMonth) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      data.fiscalYearStartYear,
      startMonth - 1 + index,
      1,
    )
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
    }
  })
}

const fiscalPeriodKey = (period: { year: number, month: number }) =>
  `${period.year}-${period.month}`

function planPeriod(startYear: number, startMonth: number) {
  const start = new Date(startYear, startMonth - 1, 1)
  const end = new Date(startYear, startMonth - 1 + 12, 0)
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`
  return `${format(start)} – ${format(end)}`
}

export function YearlyPlanManagementPage() {
  const { currentHousehold } = useHouseholds()
  const [year, setYear] = useState(new Date().getFullYear())
  const [scope, setScope] = useState<BudgetScope>('Household')
  const [plan, setPlan] = useState<YearlyPlanData | null>(null)
  const [budgetOptions, setBudgetOptions] = useState<BudgetMonthOption[]>([])
  const [amounts, setAmounts] = useState<Amounts>({})
  const [modes, setModes] = useState<Modes>({})
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [defaultStartMonth, setDefaultStartMonth] = useState(1)
  const [planStartMonth, setPlanStartMonth] = useState(1)
  const [savedPlanStartMonth, setSavedPlanStartMonth] = useState(1)
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set())
  const [replaceDrafts, setReplaceDrafts] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const currentSnapshot = useMemo(() => snapshot(amounts), [amounts])
  const isDirty =
    currentSnapshot !== savedSnapshot ||
    planStartMonth !== savedPlanStartMonth
  const canManage = currentHousehold?.role !== 'Viewer'

  const applyPlan = useCallback((data: YearlyPlanData) => {
    const state = stateFromPlan(data)
    setPlan(data)
    setAmounts(state.amounts)
    setModes(state.modes)
    setSavedSnapshot(snapshot(state.amounts))
    setDefaultStartMonth(data.householdDefaultFiscalYearStartMonth)
    setPlanStartMonth(data.fiscalYearStartMonth)
    setSavedPlanStartMonth(data.fiscalYearStartMonth)
    setSelectedPeriods(new Set(
      fiscalMonths(data, data.fiscalYearStartMonth).map(fiscalPeriodKey),
    ))
  }, [])

  const load = useCallback(async () => {
    if (!currentHousehold) return
    setIsLoading(true)
    setErrors([])
    setNotice(null)
    try {
      const [loadedPlan, loadedBudgets] = await Promise.all([
        getYearlyPlan(currentHousehold.id, year, scope),
        getBudgetMonthOptions(currentHousehold.id, scope),
      ])
      applyPlan(loadedPlan)
      setBudgetOptions(loadedBudgets)
    } catch (error) {
      setErrors(getErrorMessages(error))
      setPlan(null)
    } finally {
      setIsLoading(false)
    }
  }, [applyPlan, currentHousehold, scope, year])

  useEffect(() => { void load() }, [load])

  if (!currentHousehold) return null

  const confirmDiscard = () =>
    !isDirty || window.confirm('Discard your unsaved annual target changes?')

  const setMode = (rootId: string, nextMode: SectionMode) => {
    const root = plan?.categories.find(category => category.id === rootId)
    if (!root || modes[rootId] === nextMode) return
    const conflicts = nextMode === 'overall'
      ? root.children.map(child => child.id)
      : [root.id]
    if (conflicts.some(id => amounts[id] !== undefined) && !window.confirm(
      'Switching modes will clear annual targets entered in the other mode.',
    )) return
    setAmounts(current => {
      const next = { ...current }
      conflicts.forEach(id => delete next[id])
      return next
    })
    setModes(current => ({ ...current, [rootId]: nextMode }))
  }

  const handleSave = async () => {
    const lines = Object.entries(amounts)
      .filter(([, amount]) => amount.trim() !== '')
      .map(([categoryId, amount]) => ({
        categoryId,
        annualTargetAmount: Number(amount),
      }))
    if (lines.some(line =>
      !Number.isFinite(line.annualTargetAmount) ||
      line.annualTargetAmount < 0
    )) {
      setErrors(['Annual targets must be zero or greater.'])
      return
    }
    setIsSaving(true)
    setErrors([])
    setNotice(null)
    try {
      applyPlan(await saveYearlyPlan(
        currentHousehold.id, year, scope, planStartMonth, lines,
      ))
      setNotice('Annual targets were saved.')
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDefaultMonth = async () => {
    if (!window.confirm(
      `Use ${monthNames[defaultStartMonth - 1]} as the default start for new yearly plans? ` +
      'Existing yearly plans will not change.',
    )) return
    setIsSaving(true)
    setErrors([])
    try {
      await changeFiscalYearStartMonth(currentHousehold.id, defaultStartMonth)
      await load()
      setNotice('The household fiscal-year default was updated.')
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handlePlanStartMonthChange = (nextMonth: number) => {
    if (nextMonth === planStartMonth || !plan) return
    if (plan.id && !window.confirm(
      `Change this plan from ${planPeriod(year, planStartMonth)} to ` +
      `${planPeriod(year, nextMonth)}? Existing monthly budgets will not be ` +
      'moved, deleted, or changed. This affects the plan period and future allocations.',
    )) return

    setPlanStartMonth(nextMonth)
    setSelectedPeriods(new Set(
      fiscalMonths(plan, nextMonth).map(fiscalPeriodKey),
    ))
  }

  const handleAllocate = async () => {
    if (!plan?.id || isDirty) {
      setErrors(['Save annual targets before creating monthly budgets.'])
      return
    }
    const selected = periods
      .filter(period => selectedPeriods.has(fiscalPeriodKey(period)))
      .map(period => ({ year: period.year, month: period.month }))
    if (selected.length === 0) {
      setErrors(['Select at least one fiscal month to create.'])
      return
    }
    const impacts = allocationPreview.filter(impact =>
      selectedPeriods.has(fiscalPeriodKey(impact)))
    const createCount = impacts.filter(impact => impact.action === 'create').length
    const replaceCount = impacts.filter(impact => impact.action === 'replace').length
    const protectedCount = impacts.length - createCount - replaceCount
    if (!window.confirm(
      `Continue? ${createCount} month${createCount === 1 ? '' : 's'} will be created, ` +
      `${replaceCount} Draft${replaceCount === 1 ? '' : 's'} will be replaced, and ` +
      `${protectedCount} existing budget${protectedCount === 1 ? '' : 's'} will be kept.`,
    )) return
    setIsSaving(true)
    setErrors([])
    setNotice(null)
    try {
      const result = await allocateYearlyPlan(
        currentHousehold.id,
        year,
        scope,
        selected,
        replaceDrafts,
      )
      setNotice(
        `${result.createdCount} created, ${result.replacedDraftCount} draft ` +
        `replaced, and ${result.skippedCount} skipped.`,
      )
      setBudgetOptions(await getBudgetMonthOptions(currentHousehold.id, scope))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const periods = plan ? fiscalMonths(plan, planStartMonth) : []
  const budgetByPeriod = new Map(
    budgetOptions.map(option => [`${option.year}-${option.month}`, option]),
  )
  const allocationPreview = periods.map(period => {
    const existing = budgetByPeriod.get(`${period.year}-${period.month}`)
    if (!existing) {
      return {
        ...period,
        monthLabel: period.label,
        action: 'create' as const,
        impactLabel: 'Will create Draft',
        existingBudget: false,
      }
    }
    if (existing.status === 'Draft' && replaceDrafts) {
      return {
        ...period,
        monthLabel: period.label,
        action: 'replace' as const,
        impactLabel: 'Will replace Draft',
        existingBudget: true,
      }
    }
    if (existing.status === 'Draft') {
      return {
        ...period,
        monthLabel: period.label,
        action: 'keep' as const,
        impactLabel: 'Keep existing Draft',
        existingBudget: true,
      }
    }
    return {
      ...period,
      monthLabel: period.label,
      action: 'protected' as const,
      impactLabel: `Protected — ${existing.status}`,
      existingBudget: true,
    }
  })
  const currency = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: plan?.currency ?? currentHousehold.defaultCurrency,
  })
  const annualTotal = Object.values(amounts).reduce(
    (sum, amount) => sum + (Number(amount) || 0),
    0,
  )

  return <div className="page yearly-plan-page">
    <header className="app-header">
      <BrandLockup />
      <AppLink className="header-link" to="/dashboard">Return to dashboard</AppLink>
    </header>
    <main className="page-content">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Budgeting</p>
          <h1>Annual targets</h1>
          <p>
            Set annual category targets, then copy them into independent monthly drafts.
          </p>
        </div>
      </div>
      <BudgetingSectionNav current="annual-targets" />

      <ErrorSummary errors={errors} />
      {notice && <p className="success-message">{notice}</p>}

      <section className="panel yearly-plan-controls">
        <label>
          <span>Fiscal year starting year</span>
          <input
            type="number"
            min="1"
            max="9998"
            value={year}
            onChange={event => {
              if (confirmDiscard()) setYear(Number(event.target.value))
            }}
          />
        </label>
        <label>
          <span>Fiscal year begins</span>
          <select
            value={planStartMonth}
            disabled={!canManage}
            onChange={event =>
              handlePlanStartMonthChange(Number(event.target.value))}
          >
            {monthNames.map((name, index) =>
              <option key={name} value={index + 1}>{name}</option>)}
          </select>
          {plan?.id && <small>
            Changing this does not alter existing monthly budgets.
          </small>}
        </label>
        <label>
          <span>Scope</span>
          <select
            value={scope}
            onChange={event => {
              if (confirmDiscard()) setScope(event.target.value as BudgetScope)
            }}
          >
            <option value="Household">Household</option>
            <option value="Personal">Personal</option>
          </select>
        </label>
        <div className="yearly-plan-period">
          <span>Plan period</span>
          <strong>{plan
            ? planPeriod(plan.fiscalYearStartYear, planStartMonth)
            : 'Loading…'}</strong>
        </div>
        <div className="yearly-plan-total">
          <span>Annual target total</span>
          <strong>{currency.format(annualTotal)}</strong>
        </div>
      </section>

      <section className="panel fiscal-default-panel">
        <div>
          <h2>Household fiscal-year default</h2>
          <p>
            Chooses the initial month shown for annual plans you have not saved
            yet. You can still change the month above before saving each plan.
          </p>
        </div>
        <select
          value={defaultStartMonth}
          disabled={!canManage || isSaving}
          onChange={event => setDefaultStartMonth(Number(event.target.value))}
        >
          {monthNames.map((name, index) =>
            <option key={name} value={index + 1}>{name}</option>)}
        </select>
        <button
          className="secondary-button"
          disabled={
            !canManage ||
            isSaving ||
            defaultStartMonth === plan?.householdDefaultFiscalYearStartMonth
          }
          onClick={() => void handleDefaultMonth()}
        >
          Save default
        </button>
      </section>

      {isLoading || !plan ? (
        <p className="empty-state">Loading annual targets…</p>
      ) : (
        <section className="yearly-target-sections">
          {plan.categories.map(root => {
            const mode = modes[root.id] ?? 'overall'
            return <article className="budget-section" key={root.id}>
              <div className="budget-section-heading">
                <div>
                  <h2>{root.name}</h2>
                  {!root.isActive && <small>Deactivated category</small>}
                </div>
                <div className="budget-mode">
                  <button
                    className={mode === 'overall' ? 'selected' : ''}
                    disabled={!canManage || !root.isActive}
                    onClick={() => setMode(root.id, 'overall')}
                  >Overall</button>
                  <button
                    className={mode === 'detailed' ? 'selected' : ''}
                    disabled={!canManage || !root.isActive}
                    onClick={() => setMode(root.id, 'detailed')}
                  >Detailed</button>
                </div>
              </div>
              {mode === 'overall' ? (
                <TargetRow
                  categoryId={root.id}
                  name={`${root.name} overall`}
                  amount={amounts[root.id] ?? ''}
                  currency={plan.currency}
                  disabled={!canManage || !root.isActive}
                  onChange={value =>
                    setAmounts(current => ({ ...current, [root.id]: value }))}
                />
              ) : (
                <div className="budget-detail-list">
                  {root.children.map(child =>
                    <TargetRow
                      key={child.id}
                      categoryId={child.id}
                      name={child.name}
                      amount={amounts[child.id] ?? ''}
                      currency={plan.currency}
                      disabled={!canManage || !child.isActive}
                      onChange={value => setAmounts(current => ({
                        ...current,
                        [child.id]: value,
                      }))}
                    />)}
                </div>
              )}
            </article>
          })}
        </section>
      )}

      <section className="panel yearly-allocation-panel">
        <div className="yearly-allocation-heading">
          <h2>Create monthly drafts</h2>
          <p>
            Annual targets are copied once. Later monthly edits never change this plan.
          </p>
        </div>
        <div className="yearly-allocation-preview">
          <div className="yearly-allocation-preview-heading">
            <div>
              <strong>Choose fiscal months</strong>
              <small>
                Active and Closed budgets are protected and cannot be overwritten.
              </small>
            </div>
            <div className="yearly-month-selection-actions">
              <span>{selectedPeriods.size} of {periods.length} selected</span>
              <button
                className="text-button"
                type="button"
                disabled={selectedPeriods.size === periods.length}
                onClick={() => setSelectedPeriods(
                  new Set(periods.map(fiscalPeriodKey)),
                )}
              >Select all</button>
              <button
                className="text-button"
                type="button"
                disabled={selectedPeriods.size === 0}
                onClick={() => setSelectedPeriods(new Set())}
              >Select none</button>
            </div>
          </div>
          <ul>
            {allocationPreview.map(impact => {
              const key = fiscalPeriodKey(impact)
              const isSelected = selectedPeriods.has(key)
              return (
              <li
                className={
                  `allocation-impact-${impact.action} ` +
                  `${isSelected ? '' : 'allocation-impact-unselected'}`
                }
                key={key}
              >
                <label
                  className="yearly-month-checkbox"
                  title={`${isSelected ? 'Exclude' : 'Include'} ${impact.monthLabel}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    aria-label={`Create draft for ${impact.monthLabel}`}
                    onChange={event => setSelectedPeriods(current => {
                      const next = new Set(current)
                      if (event.target.checked) next.add(key)
                      else next.delete(key)
                      return next
                    })}
                  />
                </label>
                {impact.existingBudget ? (
                  <AppLink
                    className="yearly-allocation-budget-link"
                    to={`/budgeting?year=${impact.year}&month=${impact.month}&scope=${scope}`}
                    title={`Open the ${impact.monthLabel} ${scope.toLowerCase()} budget`}
                  >
                    <time>{impact.monthLabel}</time>
                    <div>
                      <strong>{impact.impactLabel}</strong>
                      <small>Open existing budget</small>
                    </div>
                  </AppLink>
                ) : (
                  <>
                    <time>{impact.monthLabel}</time>
                    <div>
                      <strong>{impact.impactLabel}</strong>
                      <small>Annual targets copied</small>
                    </div>
                  </>
                )}
              </li>
              )
            })}
          </ul>
        </div>
        <div className="yearly-draft-handling">
          <div>
            <strong>Existing Draft handling</strong>
            <small>
              Active and Closed budgets are always protected.
            </small>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={replaceDrafts}
              onChange={event => setReplaceDrafts(event.target.checked)}
            />
            <span>Replace amounts in existing Draft budgets after confirmation</span>
          </label>
        </div>
        <div className="yearly-allocation-submit">
          <div>
            <strong>
              Create {selectedPeriods.size} selected monthly
              Draft{selectedPeriods.size === 1 ? '' : 's'}
            </strong>
            <small>
              Review the impact labels above before continuing.
            </small>
          </div>
          <button
            className="primary-button"
            disabled={
              !canManage ||
              isSaving ||
              !plan?.id ||
              isDirty ||
              selectedPeriods.size === 0
            }
            onClick={() => void handleAllocate()}
          >Create selected drafts</button>
        </div>
      </section>

      <div className="yearly-save-bar">
        <div>
          <span>{isDirty ? 'Unsaved annual targets' : 'Annual targets saved'}</span>
          <strong>{currency.format(annualTotal)}</strong>
        </div>
        <button
          className="primary-button"
          disabled={!canManage || isSaving || !isDirty}
          onClick={() => void handleSave()}
        >{isSaving ? 'Saving…' : 'Save annual targets'}</button>
      </div>
    </main>
  </div>
}

function TargetRow({
  name,
  amount,
  currency,
  disabled,
  onChange,
}: {
  categoryId: string
  name: string
  amount: string
  currency: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const monthly = amount === '' ? null : Number(amount) / 12
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })
  return <div className="yearly-target-row">
    <strong>{name}</strong>
    <label className="currency-input">
      <span>{currency}</span>
      <input
        type="number"
        min="0"
        step="10"
        value={amount}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        onWheel={event => event.currentTarget.blur()}
        aria-label={`${name} annual target`}
      />
    </label>
    <div>
      <small>Equivalent monthly target</small>
      <strong>{monthly === null || !Number.isFinite(monthly)
        ? '—'
        : formatter.format(monthly)}</strong>
    </div>
    <div>
      <small>Equivalent quarterly target</small>
      <strong>{amount === '' || !Number.isFinite(Number(amount))
        ? '—'
        : formatter.format(Number(amount) / 4)}</strong>
    </div>
  </div>
}

export default YearlyPlanManagementPage
