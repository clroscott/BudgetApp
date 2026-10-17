import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import {
  getBudgetMonthOptions,
  type BudgetMonthOption,
  type BudgetScope,
} from '../budgets/budgetApi'
import {
  allocateYearlyPlan,
  getYearlyPlan,
  saveYearlyPlan,
  type YearlyPlanData,
} from '../budgets/yearlyPlanApi'
import { PageFrame } from '../components/PageFrame'
import { AmountCalculator } from '../components/AmountCalculator'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useHouseholds } from '../households/useHouseholds'
import { ContextualHelp } from '../components/ContextualHelp'
import { helpWarnings } from '../help/helpTopics'
import { AppLink } from '../routing/AppLink'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { useAnnualTutorialPage } from '../tutorials/annualTutorialState'
import { ApiError } from '../api/apiClient'
import { TutorialContext } from '../tutorials/tutorialContext'

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
  const tutorial = useContext(TutorialContext)
  const selection = tutorial?.annualGuide?.selection ?? tutorial?.lifecycleGuide?.annualSelection
  const [year, setYear] = useState(() => selection?.year ?? new Date().getFullYear())
  const [scope, setScope] = useState<BudgetScope>(() => selection?.scope ?? 'Household')
  const [plan, setPlan] = useState<YearlyPlanData | null>(null)
  const [budgetOptions, setBudgetOptions] = useState<BudgetMonthOption[]>([])
  const [amounts, setAmounts] = useState<Amounts>({})
  const [modes, setModes] = useState<Modes>({})
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [planStartMonth, setPlanStartMonth] = useState(() => selection?.startMonth ?? 1)
  const [savedPlanStartMonth, setSavedPlanStartMonth] = useState(1)
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set())
  const [replaceDrafts, setReplaceDrafts] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [writeUncertain, setWriteUncertain] = useState(false)
  const [allocationEvidence, setAllocationEvidence] = useState({ revision: 0, key: '', periods: [] as string[], replaces: false, replaced: 0 })
  const annualKey = `${currentHousehold?.id}/${year}/${planStartMonth}/${scope}`
  const loadState = usePageLoad(`${currentHousehold?.id}/${currentHousehold?.role}/${year}/${scope}`)
  const { run, markReady, invalidate } = loadState

  const currentSnapshot = useMemo(() => snapshot(amounts), [amounts])
  const isDirty = Boolean(plan) && (
    currentSnapshot !== savedSnapshot || planStartMonth !== savedPlanStartMonth)
  const confirmDiscard = useUnsavedChangesGuard(
    isDirty, 'Discard your unsaved annual targets or plan-period changes?',
  )
  const canManage = currentHousehold?.role !== 'Viewer' && loadState.isFresh && !isSaving && !writeUncertain

  const applyPlan = useCallback((data: YearlyPlanData) => {
    const state = stateFromPlan(data)
    setPlan(data)
    setAmounts(state.amounts)
    setModes(state.modes)
    setSavedSnapshot(snapshot(state.amounts))
    setPlanStartMonth(data.fiscalYearStartMonth)
    setSavedPlanStartMonth(data.fiscalYearStartMonth)
    setWriteUncertain(false)
    setSelectedPeriods(new Set(
      fiscalMonths(data, data.fiscalYearStartMonth).map(fiscalPeriodKey),
    ))
    markReady()
  }, [markReady])

  const load = useCallback(async () => {
    if (!currentHousehold) return
    setErrors([])
    return await run(() => Promise.all([
        getYearlyPlan(currentHousehold.id, year, scope),
        getBudgetMonthOptions(currentHousehold.id, scope),
      ]), ([loadedPlan, loadedBudgets]) => {
      applyPlan(loadedPlan)
      setBudgetOptions(loadedBudgets)
    })
  }, [applyPlan, currentHousehold, scope, year, run])

  useEffect(() => { void load() }, [load])

  const observingTutorial = Boolean(tutorial?.annualGuide || tutorial?.lifecycleGuide)
  const currentPeriods = observingTutorial && plan ? fiscalMonths(plan, planStartMonth).map(fiscalPeriodKey) : []
  const evidenceCurrent = allocationEvidence.key === annualKey
  const tutorialActive = useAnnualTutorialPage(observingTutorial ? { householdId: currentHousehold?.id ?? '', year, startMonth: planStartMonth, scope, planId: plan?.id ?? null,
    fresh: loadState.isFresh, busy: isSaving, dirty: isDirty, uncertain: writeUncertain, canManage: currentHousehold?.role !== 'Viewer', hasCategories: Boolean(plan?.categories.some(root => root.isActive)),
    selectedPeriods: [...selectedPeriods].sort(), replaceDrafts, budgets: budgetOptions.filter(option => currentPeriods.includes(fiscalPeriodKey(option))),
    allocationRevision: evidenceCurrent ? allocationEvidence.revision : 0, allocationPeriods: evidenceCurrent ? allocationEvidence.periods : [],
    allocationReplaces: evidenceCurrent && allocationEvidence.replaces, allocationReplacedCount: evidenceCurrent ? allocationEvidence.replaced : 0 } : null)

  if (!currentHousehold) return null

  const changeSelection = (nextYear: number, nextScope: BudgetScope) => {
    if ((nextYear === year && nextScope === scope) || !confirmDiscard()) return
    invalidate()
    setPlan(null)
    setAmounts({})
    setModes({})
    setSavedSnapshot(snapshot({}))
    setNotice(null)
    setYear(nextYear)
    setScope(nextScope)
  }

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
    if (!canManage) return
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
    const stillCurrent = loadState.captureContext()
    try {
      const saved = await saveYearlyPlan(
        currentHousehold.id, year, scope, planStartMonth, lines,
      )
      if (!stillCurrent()) return
      applyPlan(saved)
      setNotice('Annual targets were saved.')
    } catch (error) {
      if (stillCurrent()) {
        setErrors(getErrorMessages(error))
        if (tutorialActive && (!(error instanceof ApiError) || error.status === 0 || error.status === 409 || error.status >= 500)) setWriteUncertain(true)
      }
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
    if (!canManage) return
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
      `${protectedCount} existing budget${protectedCount === 1 ? '' : 's'} will be kept.` +
      (replaceCount > 0 ? ` ${helpWarnings.replaceDrafts}` : ''),
    )) return
    setIsSaving(true)
    setErrors([])
    setNotice(null)
    const stillCurrent = loadState.captureContext()
    try {
      const result = await allocateYearlyPlan(
        currentHousehold.id,
        year,
        scope,
        selected,
        replaceDrafts,
      )
      if (!stillCurrent()) return
      setAllocationEvidence(current => ({ revision: current.revision + 1, key: annualKey,
        periods: selected.map(fiscalPeriodKey).sort(), replaces: replaceDrafts, replaced: result.replacedDraftCount }))
      setNotice(
        `${result.createdCount} created, ${result.replacedDraftCount} draft ` +
        `replaced, and ${result.skippedCount} skipped.`,
      )
      // Allocation has already succeeded. A read retry must never allocate again.
      await run(() => getBudgetMonthOptions(currentHousehold.id, scope), setBudgetOptions)
    } catch (error) {
      if (stillCurrent()) {
        setErrors(getErrorMessages(error))
        if (tutorialActive && (!(error instanceof ApiError) || error.status === 0 || error.status === 409 || error.status >= 500)) setWriteUncertain(true)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const reloadPlan = () => {
    if (isSaving || !confirmDiscard()) return
    void load()
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

  return <PageFrame className={tutorialActive ? 'yearly-tutorial-active' : undefined} contentClassName="yearly-plan-content" footer={<><div id="lifecycle-tutorial-guide-host" /><div id="annual-tutorial-guide-host" /></>}>
      <BudgetingSectionNav current="annual-targets" />
      <div className="page-title-row" data-tutorial-id="annual-tour-title">
        <div>
          <p className="eyebrow">Budgeting</p>
          <h1>Annual targets</h1>
          <p>
            Set annual category targets, then copy them into independent monthly drafts.
            Personal and Household targets remain separate even when a transaction counts in both budgets.
          </p>
        </div>
      </div>

      <ErrorSummary errors={errors} />
      {writeUncertain && <section role="alert" className="error-summary">
        <p>The annual save or allocation result is uncertain. Check saved targets and monthly budgets before another write. A read is not proof that the original request succeeded.</p>
        <button type="button" disabled={isSaving || loadState.isPending} onClick={reloadPlan}>Check saved annual plan</button>
      </section>}
      <PageLoadFeedback subject="annual targets" status={loadState.status} errors={loadState.errors}
        disabled={isSaving} onReload={reloadPlan} />
      {notice && <p className="success-message">{notice}</p>}

      <section className="panel yearly-plan-controls" data-tutorial-id="annual-tour-selection">
        <label>
          <span>Fiscal year starting year</span>
          <input
            type="number"
            min="1"
            max="9998"
            value={year}
            disabled={isSaving}
            onChange={event => {
              changeSelection(Number(event.target.value), scope)
            }}
          />
        </label>
        <label>
          <span>Fiscal year begins</span>
          <select
            value={loadState.hasData ? planStartMonth : ''}
            disabled={!canManage}
            onChange={event =>
              handlePlanStartMonthChange(Number(event.target.value))}
          >
            {!loadState.hasData && <option value="">Unavailable</option>}
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
            disabled={isSaving}
            onChange={event => {
              changeSelection(year, event.target.value as BudgetScope)
            }}
          >
            <option value="Household">Household</option>
            <option value="Personal">Personal</option>
          </select>
        </label>
        <div className="yearly-plan-period">
          <span>Plan period</span>
          <strong>{loadState.hasData && plan
            ? planPeriod(plan.fiscalYearStartYear, planStartMonth)
            : 'Unavailable'}</strong>
        </div>
        <div className="yearly-plan-total">
          <span>Annual target total</span>
          <strong>{loadState.hasData ? currency.format(annualTotal) : '—'}</strong>
        </div>
      </section>

      <div className="contextual-help-row">
        <ContextualHelp topic="scope-privacy" />
        <ContextualHelp topic="annual-targets" />
      </div>
      <p className="field-help">
        Household default for new annual plans: {loadState.hasData && plan
          ? monthNames[plan.householdDefaultFiscalYearStartMonth - 1] : 'Unavailable'}.
        {' '}The start month above belongs to this plan. Saved plans and monthly budgets are not changed by the household default.
        {' '}<AppLink to="/household/settings">View household settings</AppLink> (Owners and Admins can change defaults).
      </p>

      {loadState.hasData && plan && (
        <section className="yearly-target-sections" data-tutorial-id="annual-tour-targets">
          {plan.categories.length === 0 && <div className="empty-state">
            <h2>No expense categories</h2>
            <p>Add expense categories before entering annual targets.</p>
            <AppLink to="/settings/categories">Manage categories</AppLink>
          </div>}
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

      {loadState.isFresh && plan && <section className="panel yearly-allocation-panel" data-tutorial-id="annual-tour-allocation">
        <div className="yearly-allocation-heading">
          <h2>Create monthly drafts</h2>
          <p>
            Annual targets are copied once. Later monthly edits never change this plan.
          </p>
        </div>
        <div className="yearly-allocation-preview" data-tutorial-id="annual-tour-months">
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
                    to={`/budgeting?year=${encodeURIComponent(impact.year)}&month=${encodeURIComponent(impact.month)}&scope=${encodeURIComponent(scope)}`}
                    title={`Open the ${impact.monthLabel} ${scope.toLowerCase()} budget`}
                    onClick={event => {
                      if (!tutorial?.annualGuide || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                      event.preventDefault()
                      if (!tutorial.annualGuide.openMonthly(impact.year, impact.month)) setNotice('Month not opened. Keep the selected tutorial plan, resolve unsaved changes, or Exit to navigate normally.')
                    }}
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
              disabled={Boolean(tutorial?.annualGuide && !replaceDrafts)}
              onChange={event => setReplaceDrafts(event.target.checked)}
            />
            <span>Replace amounts in existing Draft budgets after confirmation</span>
          </label>
        </div>
        {tutorial?.annualGuide && <p className="field-help">This guide keeps existing Drafts. Use the separate Return/replace guide for intended replacement.</p>}
        {replaceDrafts && <p className="action-consequence">{helpWarnings.replaceDrafts}</p>}
        <ContextualHelp topic="destructive-actions" />
        <div className="yearly-allocation-submit" data-tutorial-id="annual-tour-allocate">
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
      </section>}

      {loadState.hasData && plan && <div className="yearly-save-bar" role="region" aria-label="Annual target actions" data-tutorial-id="annual-tour-save">
        <div>
          <span>{!loadState.isFresh ? 'Previously loaded annual targets'
            : isDirty ? 'Unsaved annual targets' : plan.id ? 'Annual targets saved' : 'No saved annual targets'}</span>
          <strong>{currency.format(annualTotal)}</strong>
        </div>
        <div className="yearly-save-actions">
          <span className="budget-back-to-top-host" data-back-to-top-host />
          <button
            className="primary-button"
            disabled={!canManage || isSaving || !isDirty}
            onClick={() => void handleSave()}
          >{isSaving ? 'Saving…' : 'Save annual targets'}</button>
        </div>
      </div>}
  </PageFrame>
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
    <div className="amount-entry-with-calculator">
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
      <AmountCalculator
        label={`${name} annual target`}
        value={amount}
        disabled={disabled}
        onApply={onChange}
      />
    </div>
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
