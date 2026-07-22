import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
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
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'

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

export function BudgetManagementPage() {
  const { currentHousehold } = useHouseholds()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [scope, setScope] = useState<BudgetScope>('Household')
  const [budget, setBudget] = useState<BudgetPageData | null>(null)
  const [budgetOptions, setBudgetOptions] = useState<BudgetMonthOption[]>([])
  const [copySource, setCopySource] = useState('')
  const [amounts, setAmounts] = useState<Amounts>({})
  const [modes, setModes] = useState<Modes>({})
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const currentSnapshot = useMemo(() => snapshot(amounts), [amounts])
  const isDirty = Boolean(budget?.id) && currentSnapshot !== savedSnapshot
  const canManage = currentHousehold?.role !== 'Viewer'
  const isClosed = budget?.status === 'Closed'
  const canEdit = canManage && Boolean(budget?.id) && !isClosed

  const applyBudget = useCallback((data: BudgetPageData) => {
    const state = stateFromBudget(data)
    setBudget(data)
    setAmounts(state.amounts)
    setModes(state.modes)
    setSavedSnapshot(snapshot(state.amounts))
  }, [])

  const loadBudget = useCallback(async () => {
    if (!currentHousehold) return
    setIsLoading(true)
    setErrors([])
    try {
      const [loadedBudget, options] = await Promise.all([
        getBudget(currentHousehold.id, year, month, scope),
        getBudgetMonthOptions(currentHousehold.id, scope),
      ])
      applyBudget(loadedBudget)
      setBudgetOptions(options)
      const previous = new Date(year, month - 2, 1)
      const preferred = options.find(option =>
        option.year === previous.getFullYear() &&
        option.month === previous.getMonth() + 1)
      const selected = preferred ?? options[0]
      setCopySource(selected ? `${selected.year}-${selected.month}` : '')
    } catch (error) {
      setErrors(getErrorMessages(error))
      setBudget(null)
    } finally {
      setIsLoading(false)
    }
  }, [applyBudget, currentHousehold, month, scope, year])

  useEffect(() => { void loadBudget() }, [loadBudget])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  if (!currentHousehold) return null

  const confirmDiscard = () => !isDirty || window.confirm('Discard your unsaved budget changes?')

  const changePeriod = (nextYear: number, nextMonth: number) => {
    if (!confirmDiscard()) return
    const date = new Date(nextYear, nextMonth - 1, 1)
    setYear(date.getFullYear())
    setMonth(date.getMonth() + 1)
  }

  const handleScopeChange = (nextScope: BudgetScope) => {
    if (confirmDiscard()) setScope(nextScope)
  }

  const handleCreate = async (
    method: 'blank' | 'copy' | 'from-recurring',
  ) => {
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
    if (!budget?.id || budget.status !== 'Draft' || !window.confirm(
      'Delete this draft budget and all of its amounts? This cannot be undone.',
    )) return
    setIsSaving(true)
    setErrors([])
    try {
      await deleteDraftBudget(currentHousehold.id, budget.id)
      await loadBudget()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async () => {
    if (!budget?.id) return
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

  const handleStatus = async (action: 'activate' | 'close' | 'reopen') => {
    if (!budget?.id || isDirty) return
    if (action === 'close' && !window.confirm('Close this budget? It will become read-only.')) return
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

  return (
    <main className="management-page budget-page">
      <header className="app-header">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">B</span><span>BudgetApp</span></div>
        <AppLink className="header-link" to="/dashboard" onClick={event => {
          if (!confirmDiscard()) event.preventDefault()
        }}>Dashboard</AppLink>
      </header>

      <div className="budget-page-layout">
      <section
        className="management-content budget-content"
        data-back-to-top-scroll-region
      >
        <div className="page-title-row">
          <div><p className="eyebrow">Budgeting</p><h1>Monthly budget</h1><p>Plan household or personal spending one month at a time. <AppLink to="/budgeting/recurring-expenses">Manage recurring expenses</AppLink></p></div>
          {budget?.status && <span className={`budget-status budget-status-${budget.status.toLowerCase()}`}>{budget.status}</span>}
        </div>

        <section className="budget-period-panel" aria-label="Budget period">
          <button className="secondary-button" type="button" onClick={() => changePeriod(year, month - 1)}>Previous</button>
          <label>Month<select value={month} onChange={event => changePeriod(year, Number(event.target.value))}>
            {monthNames.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
          </select></label>
          <label>Year<input type="number" min="1" max="9999" value={year} onChange={event => changePeriod(Number(event.target.value), month)} /></label>
          <label>Scope<select value={scope} onChange={event => handleScopeChange(event.target.value as BudgetScope)}>
            <option value="Household">Household</option><option value="Personal">Personal</option>
          </select></label>
          <button className="secondary-button" type="button" onClick={() => changePeriod(now.getFullYear(), now.getMonth() + 1)}>Current month</button>
          <button className="secondary-button" type="button" onClick={() => changePeriod(year, month + 1)}>Next</button>
        </section>

        <ErrorSummary errors={errors} />

        {isLoading ? <p className="empty-state">Loading budget...</p> : !budget?.id ? (
          <div className="budget-empty-state"><div className="empty-state"><h2>No budget for {monthNames[month - 1]} {year}</h2><p>Choose how to start this {scope.toLowerCase()} budget.</p></div>{canManage && <div className="budget-initialization-grid"><article><h3>Copy an existing month</h3><p>Copy budget amounts and category detail from any existing {scope.toLowerCase()} budget.</p><label className="budget-copy-source"><span>Budget to copy</span><select value={copySource} disabled={budgetOptions.length === 0 || isSaving} onChange={event => setCopySource(event.target.value)}>{budgetOptions.length === 0 ? <option value="">No existing budgets</option> : budgetOptions.map(option => <option key={option.id} value={`${option.year}-${option.month}`}>{monthNames[option.month - 1]} {option.year} ({option.status})</option>)}</select></label><button className="secondary-button" type="button" disabled={isSaving || !copySource} onClick={() => void handleCreate('copy')}>Copy selected month</button></article><article><h3>Use recurring expenses</h3><p>Build category amounts from active recurring expenses that apply this month.</p><button className="secondary-button" type="button" disabled={isSaving} onClick={() => void handleCreate('from-recurring')}>Build from recurring expenses</button></article><article><h3>Start from scratch</h3><p>Create an empty draft and enter every amount yourself.</p><button className="primary-button" type="button" disabled={isSaving} onClick={() => void handleCreate('blank')}>Create blank budget</button></article></div>}</div>
        ) : budget.categories.length === 0 ? (
          <div className="empty-state"><h2>No expense categories</h2><p>Add expense categories before entering budget amounts.</p><AppLink to="/settings/categories">Manage categories</AppLink></div>
        ) : (
          <>
            {isClosed && <p className="budget-readonly-note">This historical budget is closed and read-only.</p>}
            <div className="budget-sections">
              {budget.categories.map(root => {
                const mode = modes[root.id] ?? 'overall'
                return <section className="budget-section" key={root.id}>
                  <div className="budget-section-heading"><div><h2>{root.name}</h2>{!root.isActive && <span className="status-pill">Deactivated</span>}</div>
                    {root.children.length > 0 && <div className="budget-mode" aria-label={`${root.name} budgeting mode`}>
                      <button type="button" className={mode === 'overall' ? 'selected' : ''} disabled={!canEdit || isSaving} onClick={() => setMode(root.id, 'overall')}>Overall</button>
                      <button type="button" className={mode === 'detailed' ? 'selected' : ''} disabled={!canEdit || isSaving} onClick={() => setMode(root.id, 'detailed')}>Detailed</button>
                    </div>}
                  </div>
                  {mode === 'overall' ? <label className="budget-amount-row"><span>{root.name} total</span><span className="currency-input"><span>{budget.currency}</span><input aria-label={`${root.name} budget`} type="number" min="0" step="0.01" placeholder="No budget" disabled={!canEdit || isSaving || !root.isActive} value={amounts[root.id] ?? ''} onChange={event => setAmounts(current => ({ ...current, [root.id]: event.target.value }))} /></span></label> :
                    <div className="budget-detail-list">{root.children.map(child => <label className="budget-amount-row" key={child.id}><span>{child.name}{!child.isActive && <small> Deactivated</small>}</span><span className="currency-input"><span>{budget.currency}</span><input aria-label={`${child.name} budget`} type="number" min="0" step="0.01" placeholder="No budget" disabled={!canEdit || isSaving || !child.isActive} value={amounts[child.id] ?? ''} onChange={event => setAmounts(current => ({ ...current, [child.id]: event.target.value }))} /></span></label>)}</div>}
                </section>
              })}
            </div>
          </>
        )}
      </section>
        <section
          className="budget-save-bar"
          aria-label="Budget actions"
          hidden={isLoading || !budget?.id || budget.categories.length === 0}
        >
          <div>
            <span>Monthly budget</span>
            <strong>{formattedTotal}</strong>
            {isDirty && <small>Unsaved changes</small>}
          </div>
          <div className="budget-save-actions">
            <span className="budget-back-to-top-host" data-back-to-top-host />
            {budget?.status === 'Draft' && canManage && <button className="danger-button" type="button" disabled={isSaving} onClick={() => void handleDeleteDraft()}>Delete draft</button>}
            {budget?.status === 'Draft' && canManage && <button className="secondary-button" type="button" disabled={isSaving || isDirty} title={isDirty ? 'Save changes before activating.' : undefined} onClick={() => void handleStatus('activate')}>Activate</button>}
            {budget?.status === 'Active' && canManage && <button className="secondary-button" type="button" disabled={isSaving || isDirty} title={isDirty ? 'Save changes before closing.' : undefined} onClick={() => void handleStatus('close')}>Close budget</button>}
            {budget?.status === 'Closed' && canManage && <button className="secondary-button" type="button" disabled={isSaving} onClick={() => void handleStatus('reopen')}>Reopen budget</button>}
            {canEdit && <button className="primary-button" type="button" disabled={isSaving || !isDirty} onClick={() => void handleSave()}>{isSaving ? 'Saving...' : 'Save budget'}</button>}
          </div>
        </section>
      </div>
    </main>
  )
}
