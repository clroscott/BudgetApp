import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { PageFrame } from '../components/PageFrame'
import { AmountCalculator } from '../components/AmountCalculator'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { ContextualHelp } from '../components/ContextualHelp'
import { helpWarnings } from '../help/helpTopics'
import {
  changeBudgetStatus,
  copyBudget,
  createBudget,
  deleteDraftBudget,
  getBudget,
  getBudgetMonthOptions,
  initializeBudget,
  saveBudget,
  type BudgetPageData,
  type BudgetMonthOption,
  type BudgetScope,
} from '../budgets/budgetApi'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'

type SectionMode = 'overall' | 'detailed'
type Amounts = Record<string, string>
type Modes = Record<string, SectionMode>

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2020, index, 1)))

function stateFromBudget(data: BudgetPageData): { amounts: Amounts, modes: Modes } {
  const amounts: Amounts = {}
  const modes: Modes = {}
  for (const root of data.categories) {
    if (root.budgetedAmount !== null) amounts[root.id] = String(root.budgetedAmount)
    const hasChildLine = root.children.some(child => child.budgetedAmount !== null)
    modes[root.id] = hasChildLine ? 'detailed' : 'overall'
    for (const child of root.children) {
      if (child.budgetedAmount !== null) amounts[child.id] = String(child.budgetedAmount)
    }
  }
  return { amounts, modes }
}

function snapshot(amounts: Amounts): string {
  // A mode with no amount is an unbudgeted section and has nothing to persist yet.
  return JSON.stringify(Object.entries(amounts).filter(([, value]) => value !== '').sort())
}

function initialBudgetSelection() {
  const now = new Date()
  const search = new URLSearchParams(window.location.search)
  const requestedYear = Number(search.get('year'))
  const requestedMonth = Number(search.get('month'))
  const requestedScope = search.get('scope')

  return {
    year: Number.isInteger(requestedYear) && requestedYear >= 1 && requestedYear <= 9998
      ? requestedYear
      : now.getFullYear(),
    month: Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
      ? requestedMonth
      : now.getMonth() + 1,
    scope: requestedScope === 'Personal' ? 'Personal' as const : 'Household' as const,
  }
}

function BudgetAmountInput({
  name,
  currency,
  value,
  disabled,
  onChange,
}: {
  name: string
  currency: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <span className="amount-entry-with-calculator">
      <span className="currency-input">
        <span>{currency}</span>
        <input
          aria-label={`${name} budget`}
          type="number"
          min="0"
          step="10"
          placeholder="No budget"
          disabled={disabled}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      </span>
      <AmountCalculator
        label={`${name} budget`}
        value={value}
        disabled={disabled}
        onApply={onChange}
      />
    </span>
  )
}

export function BudgetManagementPage() {
  const { currentHousehold } = useHouseholds()
  const now = new Date()
  const [initialSelection] = useState(initialBudgetSelection)
  const [year, setYear] = useState(initialSelection.year)
  const [month, setMonth] = useState(initialSelection.month)
  const [scope, setScope] = useState<BudgetScope>(initialSelection.scope)
  const [budget, setBudget] = useState<BudgetPageData | null>(null)
  const [budgetOptions, setBudgetOptions] = useState<BudgetMonthOption[]>([])
  const [copySource, setCopySource] = useState('')
  const [amounts, setAmounts] = useState<Amounts>({})
  const [modes, setModes] = useState<Modes>({})
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const loadState = usePageLoad(`${currentHousehold?.id}/${year}/${month}/${scope}`)
  const { run, markReady, invalidate } = loadState
  const pageRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<HTMLElement>(null)
  const hasBudgetActions = Boolean(loadState.hasData && budget?.id && budget.categories.length > 0)

  // Fixed actions must not cover the last rows. Measure wrapping, unsaved text
  // and the asynchronously portaled Back to top button, not a guessed height.
  useLayoutEffect(() => {
    const page = pageRef.current
    const actions = actionsRef.current
    if (!hasBudgetActions || !page || !actions) return
    const reserveSpace = () => page.style.setProperty(
      '--budget-actions-height', `${Math.ceil(actions.getBoundingClientRect().height)}px`,
    )
    reserveSpace()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reserveSpace)
    observer?.observe(actions)
    window.addEventListener('resize', reserveSpace)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', reserveSpace)
      page.style.removeProperty('--budget-actions-height')
    }
  }, [hasBudgetActions])

  const currentSnapshot = useMemo(() => snapshot(amounts), [amounts])
  const isDirty = Boolean(budget?.id) && currentSnapshot !== savedSnapshot
  const confirmDiscard = useUnsavedChangesGuard(isDirty, 'Discard your unsaved budget changes?')
  const canManage = currentHousehold?.role !== 'Viewer' && loadState.isFresh
  const isClosed = budget?.status === 'Closed'
  const canEdit = canManage && Boolean(budget?.id) && !isClosed

  const applyBudget = useCallback((data: BudgetPageData) => {
    const state = stateFromBudget(data)
    setBudget(data)
    setAmounts(state.amounts)
    setModes(state.modes)
    setSavedSnapshot(snapshot(state.amounts))
    markReady()
  }, [markReady])

  const loadBudget = useCallback(async () => {
    if (!currentHousehold) return
    setErrors([])
    return await run(() => Promise.all([
        getBudget(currentHousehold.id, year, month, scope),
        getBudgetMonthOptions(currentHousehold.id, scope),
      ]), ([loadedBudget, options]) => {
      applyBudget(loadedBudget)
      setBudgetOptions(options)
      const previous = new Date(year, month - 2, 1)
      const preferred = options.find(option =>
        option.year === previous.getFullYear() &&
        option.month === previous.getMonth() + 1)
      const selected = preferred ?? options[0]
      setCopySource(selected ? `${selected.year}-${selected.month}` : '')
    })
  }, [applyBudget, currentHousehold, month, scope, year, run])

  useEffect(() => { void loadBudget() }, [loadBudget])

  if (!currentHousehold) return null

  const discardForSelection = () => {
    invalidate()
    setBudget(null)
    setAmounts({})
    setModes({})
    setSavedSnapshot(snapshot({}))
    setNotice(null)
  }

  const changePeriod = (nextYear: number, nextMonth: number) => {
    const date = new Date(nextYear, nextMonth - 1, 1)
    if (date.getFullYear() === year && date.getMonth() + 1 === month) return
    if (!confirmDiscard()) return
    discardForSelection()
    setYear(date.getFullYear())
    setMonth(date.getMonth() + 1)
  }

  const handleScopeChange = (nextScope: BudgetScope) => {
    if (nextScope === scope || !confirmDiscard()) return
    discardForSelection()
    setScope(nextScope)
  }

  const handleCreate = async (
    method: 'blank' | 'copy' | 'from-recurring',
  ) => {
    if (!canManage || isSaving || budget?.id) return
    setIsSaving(true)
    setErrors([])
    try {
      if (method === 'blank') {
        applyBudget(await createBudget(currentHousehold.id, year, month, scope))
      } else if (method === 'from-recurring') {
        applyBudget(await initializeBudget(
          currentHousehold.id, year, month, scope, method,
        ))
      } else {
        const [sourceYear, sourceMonth] = copySource.split('-').map(Number)
        if (!sourceYear || !sourceMonth) {
          setErrors(['Select an existing budget to copy.'])
          return
        }
        applyBudget(await copyBudget(
          currentHousehold.id, year, month, scope, sourceYear, sourceMonth,
        ))
      }
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteDraft = async () => {
    if (!canManage || isSaving || !budget?.id || budget.status !== 'Draft' || !window.confirm(
      helpWarnings.confirmDeleteDraft,
    )) return
    setIsSaving(true)
    setErrors([])
    try {
      await deleteDraftBudget(currentHousehold.id, budget.id)
      setNotice('Draft budget deleted. Reload the month if the updated view is unavailable.')
      setBudget(null)
      invalidate()
      await loadBudget()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async () => {
    if (!canEdit || isSaving || !budget?.id) return
    const lines = Object.entries(amounts)
      .filter(([, amount]) => amount.trim() !== '')
      .map(([categoryId, amount]) => ({ categoryId, budgetedAmount: Number(amount) }))
    if (lines.some(line => !Number.isFinite(line.budgetedAmount) || line.budgetedAmount < 0)) {
      setErrors(['Budget amounts must be zero or greater.'])
      return
    }

    setIsSaving(true)
    setErrors([])
    try {
      applyBudget(await saveBudget(currentHousehold.id, budget.id, lines))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleStatus = async (
    action: 'activate' | 'close' | 'return-to-draft' | 'reopen',
  ) => {
    if (!canManage || isSaving || !budget?.id || isDirty) return
    if (action === 'close' && !window.confirm('Close this budget? It will become read-only.')) return
    if (action === 'return-to-draft' && !window.confirm(
      helpWarnings.confirmReturnToDraft,
    )) return
    if (action === 'reopen' && !window.confirm('Reopen this budget and allow changes again?')) return
    setIsSaving(true)
    setErrors([])
    try {
      applyBudget(await changeBudgetStatus(currentHousehold.id, budget.id, action))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const setMode = (rootId: string, nextMode: SectionMode) => {
    const root = budget?.categories.find(category => category.id === rootId)
    if (!root || modes[rootId] === nextMode) return
    const conflictingIds = nextMode === 'overall'
      ? root.children.map(child => child.id)
      : [root.id]
    const hasConflictingAmounts = conflictingIds.some(id => amounts[id] !== undefined && amounts[id] !== '')
    if (hasConflictingAmounts && !window.confirm(
      'Switching modes will clear the amounts entered for the other budgeting mode. Continue?',
    )) return
    setAmounts(current => {
      const next = { ...current }
      for (const id of conflictingIds) delete next[id]
      return next
    })
    setModes(current => ({ ...current, [rootId]: nextMode }))
  }

  const reloadBudget = () => {
    if (isSaving || !confirmDiscard()) return
    void loadBudget()
  }

  const total = budget?.categories.reduce((sum, root) => {
    if (modes[root.id] === 'detailed') {
      return sum + root.children.reduce((childSum, child) =>
        childSum + (Number(amounts[child.id]) || 0), 0)
    }
    return sum + (Number(amounts[root.id]) || 0)
  }, 0) ?? 0
  const formattedTotal = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: budget?.currency ?? currentHousehold.defaultCurrency,
  }).format(total)
  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: budget?.currency ?? currentHousehold.defaultCurrency,
  })
  const actualTotal = budget?.categories.reduce(
    (sum, category) => sum + category.actualAmount, 0,
  ) ?? 0
  const formatAmount = (amount: number) => currencyFormatter.format(amount)

  const amountOrNull = (categoryId: string) => {
    const value = amounts[categoryId]
    return value === undefined || value.trim() === '' ? null : Number(value)
  }

  const sectionBudget = (root: BudgetPageData['categories'][number]) => {
    if (modes[root.id] !== 'detailed') return amountOrNull(root.id)
    const childAmounts = root.children
      .map(child => amountOrNull(child.id))
      .filter((amount): amount is number => amount !== null)
    return childAmounts.length === 0
      ? null
      : childAmounts.reduce((sum, amount) => sum + amount, 0)
  }

  const metrics = (budgeted: number | null, actual: number) => {
    const remaining = budgeted === null ? null : budgeted - actual
    return <span className="budget-metrics">
      <span><small>Actual</small><strong>{formatAmount(actual)}</strong></span>
      <span className={remaining !== null && remaining < 0 ? 'budget-over' : ''}>
        <small>Remaining</small><strong>{remaining === null ? '—' : formatAmount(remaining)}</strong>
      </span>
    </span>
  }

  const planningMetrics = (category: BudgetPageData['categories'][number]) => (
    <span className="budget-planning-metrics" aria-label={`${category.name} planning history`}>
      <span><small>Monthly target</small><strong>{category.monthlyTargetAmount === null ? '—' : formatAmount(category.monthlyTargetAmount)}</strong></span>
      <span><small>Avg / month</small><strong>{formatAmount(category.averageMonthlyActualAmount)}</strong></span>
      <span><small>Last budget</small><strong>{category.lastMonthBudgetedAmount === null ? '—' : formatAmount(category.lastMonthBudgetedAmount)}</strong></span>
      <span><small>Last actual</small><strong>{formatAmount(category.lastMonthActualAmount)}</strong></span>
    </span>
  )

  const actions = hasBudgetActions && budget && <section
    className="budget-save-bar"
    aria-label="Budget actions"
    ref={actionsRef}
  >
    <div>
      <span>Monthly budget</span>
      <strong>{formattedTotal}</strong>
      <small>Actual {formatAmount(actualTotal)} · Remaining {formatAmount(total - actualTotal)}</small>
      {isDirty && <small>Unsaved changes</small>}
    </div>
    <div className="budget-save-actions">
      <span className="budget-back-to-top-host" data-back-to-top-host />
      {budget?.status === 'Draft' && canManage && <button className="danger-button" type="button" disabled={isSaving} onClick={() => void handleDeleteDraft()}>Delete draft</button>}
      {budget?.status === 'Draft' && canManage && <button className="secondary-button" type="button" disabled={isSaving || isDirty} title={isDirty ? 'Save changes before activating.' : undefined} onClick={() => void handleStatus('activate')}>Activate</button>}
      {budget?.status === 'Active' && canManage && <button className="secondary-button" type="button" disabled={isSaving || isDirty} title={isDirty ? 'Save changes before returning to Draft.' : undefined} onClick={() => void handleStatus('return-to-draft')}>Return to draft</button>}
      {budget?.status === 'Active' && canManage && <button className="secondary-button" type="button" disabled={isSaving || isDirty} title={isDirty ? 'Save changes before closing.' : undefined} onClick={() => void handleStatus('close')}>Close budget</button>}
      {budget?.status === 'Closed' && canManage && <button className="secondary-button" type="button" disabled={isSaving} onClick={() => void handleStatus('reopen')}>Reopen budget</button>}
      {canEdit && <button className="primary-button" type="button" disabled={isSaving || !isDirty} onClick={() => void handleSave()}>{isSaving ? 'Saving...' : 'Save budget'}</button>}
    </div>
  </section>

  return (
    <PageFrame className="budget-page" contentClassName="budget-content" ref={pageRef} footer={actions}>
        <BudgetingSectionNav current="monthly" />
        <div className="page-title-row" data-tutorial-id="monthly-budget-page-title">
          <div><p className="eyebrow">Budgeting</p><h1>Monthly budget</h1><p>Plan household or personal spending one month at a time.</p>
            <p>Actuals follow “Include in budgets” on each transaction. Shared expenses can count
              in both scopes; your budget amounts remain separate.</p></div>
          {loadState.hasData && budget?.status && <span className={`budget-status budget-status-${budget.status.toLowerCase()}`}>{budget.status}</span>}
        </div>

        <section className="budget-period-panel" aria-label="Budget period">
          <button className="secondary-button" type="button" disabled={isSaving} onClick={() => changePeriod(year, month - 1)}>Previous</button>
          <label>Month<select value={month} disabled={isSaving} onChange={event => changePeriod(year, Number(event.target.value))}>
            {monthNames.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
          </select></label>
          <label>Year<input type="number" min="1" max="9999" value={year} disabled={isSaving} onChange={event => changePeriod(Number(event.target.value), month)} /></label>
          <label>Scope<select value={scope} disabled={isSaving} onChange={event => handleScopeChange(event.target.value as BudgetScope)}>
            <option value="Household">Household</option><option value="Personal">Personal</option>
          </select></label>
          <button className="secondary-button" type="button" disabled={isSaving} onClick={() => changePeriod(now.getFullYear(), now.getMonth() + 1)}>Current month</button>
          <button className="secondary-button" type="button" disabled={isSaving} onClick={() => changePeriod(year, month + 1)}>Next</button>
        </section>

        <div className="contextual-help-row">
          <ContextualHelp topic="scope-privacy" />
          <ContextualHelp topic="budget-states" />
          <ContextualHelp topic="annual-targets" />
        </div>
        <ErrorSummary errors={errors} />
        {notice && <p role="status">{notice}</p>}
        <PageLoadFeedback subject="budget" status={loadState.status} errors={loadState.errors}
          disabled={isSaving} onReload={reloadBudget} />

        {!loadState.hasData || !budget ? null : !budget.id && !loadState.isFresh ? (
          <p className="empty-state">No budget was saved in the last successful response. Its current status is unavailable.</p>
        ) : !budget.id ? (
          <div className="budget-empty-state"><div className="empty-state"><h2>No budget for {monthNames[month - 1]} {year}</h2><p>Choose how to start this {scope.toLowerCase()} budget.</p></div>{canManage && <div className="budget-initialization-grid"><article><h3>Copy an existing month</h3><p>Copy budget amounts and category detail from any existing {scope.toLowerCase()} budget.</p><label className="budget-copy-source"><span>Budget to copy</span><select value={copySource} disabled={budgetOptions.length === 0 || isSaving} onChange={event => setCopySource(event.target.value)}>{budgetOptions.length === 0 ? <option value="">No existing budgets</option> : budgetOptions.map(option => <option key={option.id} value={`${option.year}-${option.month}`}>{monthNames[option.month - 1]} {option.year} ({option.status})</option>)}</select></label><button className="secondary-button" type="button" disabled={isSaving || !copySource} onClick={() => void handleCreate('copy')}>Copy selected month</button></article><article><h3>Use recurring expenses</h3><p>Build category amounts from active recurring expenses that apply this month.</p><button className="secondary-button" type="button" disabled={isSaving} onClick={() => void handleCreate('from-recurring')}>Build from recurring expenses</button></article><article><h3>Start from scratch</h3><p>Create an empty draft and enter every amount yourself.</p><button className="primary-button" type="button" disabled={isSaving} onClick={() => void handleCreate('blank')}>Create blank budget</button></article></div>}</div>
        ) : budget.categories.length === 0 ? (
          <div className="empty-state"><h2>No expense categories</h2><p>Add expense categories before entering budget amounts.</p><AppLink to="/settings/categories">Manage categories</AppLink></div>
        ) : (
          <>
            {isClosed && <p className="budget-readonly-note">This historical budget’s planned amounts are closed and read-only. Actuals can still change when transactions are corrected.</p>}
            {budget.uncategorizedActualAmount !== 0 && <p className="budget-actual-warning"><strong>{formatAmount(budget.uncategorizedActualAmount)} uncategorized</strong> is not included in the category totals. Categorize those transactions to see the complete budget picture.</p>}
            {budget.currencyMismatchTransactionCount > 0 && <p className="budget-actual-warning"><strong>{budget.currencyMismatchTransactionCount} transaction{budget.currencyMismatchTransactionCount === 1 ? '' : 's'}</strong> in another currency {budget.currencyMismatchTransactionCount === 1 ? 'is' : 'are'} excluded because currency conversion is not available yet.</p>}
            <div className="budget-sections">
              {budget.categories.map(root => {
                const mode = modes[root.id] ?? 'overall'
                const rootBudget = sectionBudget(root)
                return <section className="budget-section" key={root.id}>
                  <div className="budget-section-heading"><div><h2>{root.name}</h2>{!root.isActive && <span className="status-pill">Deactivated</span>}</div>
                    {root.children.length > 0 && <div className="budget-mode" aria-label={`${root.name} budgeting mode`}>
                      <button type="button" className={mode === 'overall' ? 'selected' : ''} disabled={!canEdit || isSaving} onClick={() => setMode(root.id, 'overall')}>Overall</button>
                      <button type="button" className={mode === 'detailed' ? 'selected' : ''} disabled={!canEdit || isSaving} onClick={() => setMode(root.id, 'detailed')}>Detailed</button>
                    </div>}
                  </div>
                  <div className="budget-section-summary"><span><small>Budgeted</small><strong>{rootBudget === null ? 'No budget' : formatAmount(rootBudget)}</strong></span>{metrics(rootBudget, root.actualAmount)}</div>
                  {mode === 'overall' ? <div className="budget-amount-row"><span className="budget-row-name">{root.name} total</span>{planningMetrics(root)}<span className="budget-row-values"><BudgetAmountInput name={root.name} currency={budget.currency} disabled={!canEdit || isSaving || !root.isActive} value={amounts[root.id] ?? ''} onChange={value => setAmounts(current => ({ ...current, [root.id]: value }))} />{metrics(amountOrNull(root.id), root.actualAmount)}</span></div> :
                    <div className="budget-detail-list">
                      {root.directActualAmount !== 0 && <div className="budget-amount-row budget-direct-actual"><span>Directly categorized to {root.name}</span>{metrics(null, root.directActualAmount)}</div>}
                      {root.children.map(child => <div className="budget-amount-row" key={child.id}><span className="budget-row-name">{child.name}{!child.isActive && <small> Deactivated</small>}</span>{planningMetrics(child)}<span className="budget-row-values"><BudgetAmountInput name={child.name} currency={budget.currency} disabled={!canEdit || isSaving || !child.isActive} value={amounts[child.id] ?? ''} onChange={value => setAmounts(current => ({ ...current, [child.id]: value }))} />{metrics(amountOrNull(child.id), child.actualAmount)}</span></div>)}
                    </div>}
                </section>
              })}
            </div>
          </>
        )}
        {loadState.hasData && budget?.id && canManage && budget.status !== 'Closed' &&
          <aside className="budget-action-help" aria-label="Budget removal and replacement">
            <p className="action-consequence">{budget.status === 'Draft' ? helpWarnings.deleteDraft : helpWarnings.returnToDraft}</p>
            <ContextualHelp topic="destructive-actions" />
          </aside>}
    </PageFrame>
  )
}
