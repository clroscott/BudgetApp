import { useCallback, useContext, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import { PageFrame } from '../components/PageFrame'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import {
  createRecurringExpense,
  getRecurringExpenses,
  setRecurringExpenseActive,
  updateRecurringExpense,
  type RecurringExpenseBudgetMode,
  type RecurringExpenseItem,
  type RecurringExpenseRequest,
  type RecurringExpenseScope,
} from '../recurringExpenses/recurringExpenseApi'
import { useUnsavedForm } from '../routing/useUnsavedForm'
import { ApiError } from '../api/apiClient'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useRecurringTutorialPage } from '../tutorials/recurringTutorialState'
import { TutorialContext } from '../tutorials/tutorialContext'

interface ExpenseDraft {
  name: string
  amount: string
  scope: RecurringExpenseScope
  budgetMode: RecurringExpenseBudgetMode
  subcategoryId: string
  accountId: string
  expectedDayOfMonth: string
  startsOn: string
  endsOn: string
}

function localDate(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function emptyDraft(scope: RecurringExpenseScope): ExpenseDraft {
  return {
    name: '', amount: '', scope, budgetMode: 'Detailed',
    subcategoryId: '', accountId: '',
    expectedDayOfMonth: '', startsOn: localDate(), endsOn: '',
  }
}

function toRequest(draft: ExpenseDraft): RecurringExpenseRequest {
  return {
    name: draft.name,
    amount: Number(draft.amount),
    scope: draft.scope,
    budgetMode: draft.budgetMode,
    subcategoryId: draft.subcategoryId,
    accountId: draft.accountId || null,
    expectedDayOfMonth: draft.expectedDayOfMonth
      ? Number(draft.expectedDayOfMonth)
      : null,
    startsOn: draft.startsOn,
    endsOn: draft.endsOn || null,
  }
}

export function RecurringExpenseManagementPage() {
  const { currentHousehold } = useHouseholds()
  const canManageHousehold = currentHousehold?.role !== 'Viewer'
  const defaultScope: RecurringExpenseScope = canManageHousehold ? 'Household' : 'Personal'
  const [expenses, setExpenses] = useState<RecurringExpenseItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [createDraft, setCreateDraft] = useState<ExpenseDraft>(() => emptyDraft(defaultScope))
  const [editDraft, setEditDraft] = useState<ExpenseDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const recurringTask = useContext(TutorialContext)?.recurringGuide
  const [guideSelection, setGuideSelection] = useState<string | null>(() => recurringTask?.selection ?? null)
  const [createdId, setCreatedId] = useState<string | null>(() => recurringTask?.expenseId ?? null)
  const [uncertain, setUncertain] = useState(false)
  const [needsRead, setNeedsRead] = useState(false)
  const loadState = usePageLoad(`${currentHousehold?.id}/${currentHousehold?.role}`)
  const { run, captureContext } = loadState
  const createGuard = useUnsavedForm(createDraft, 'Discard the new recurring expense details?')
  const editGuard = useUnsavedForm(editDraft, 'Discard your unsaved recurring expense changes?')
  const selectedExpense = expenses.find(item => item.id === (guideSelection === 'new' ? createdId : guideSelection))
  const selectedScope = guideSelection === 'new' && !createdId ? createDraft.scope : selectedExpense?.scope ?? null
  const selectedEditing = guideSelection === 'new' && !createdId || editingId === selectedExpense?.id && editDraft !== null
  const tutorialActive = useRecurringTutorialPage(currentHousehold ? {
    householdId: currentHousehold.id, fresh: loadState.isFresh && !needsRead, busy: isSaving || loadState.isPending,
    dirty: createGuard.isDirty || editGuard.isDirty, uncertain,
    selection: guideSelection, scope: selectedScope, editing: Boolean(selectedEditing),
    saved: Boolean(selectedExpense?.isActive && loadState.isFresh), expenseId: selectedExpense?.id ?? null,
  } : null)

  const load = useCallback(async () => {
    if (!currentHousehold) return false
    return run(() => Promise.all([
        getRecurringExpenses(currentHousehold.id),
        getCategories(currentHousehold.id),
        getAccounts(currentHousehold.id),
      ]), ([expenseItems, categoryItems, accountItems]) => {
      setExpenses(expenseItems)
      setCategories(categoryItems)
      setAccounts(accountItems)
      setNeedsRead(false)
    })
  }, [currentHousehold, run])

  useEffect(() => { void load() }, [load])

  const visibleExpenses = useMemo(
    () => expenses.filter(expense => showInactive || expense.isActive),
    [expenses, showInactive],
  )

  if (!currentHousehold) return null

  const performChange = async <T,>(change: () => Promise<T>, confirmed?: (result: T) => void): Promise<boolean> => {
    if (isSaving || !loadState.isFresh || uncertain) return false
    const isCurrent = captureContext()
    setIsSaving(true)
    setErrors([])
    try {
      const result = await change()
      if (!isCurrent()) return false
      // A confirmed write is not repeated just because the follow-up read fails.
      confirmed?.(result)
      return await load()
    } catch (error) {
      if (!isCurrent()) return false
      setErrors(getErrorMessages(error))
      if (tutorialActive && !(error instanceof ApiError && [400, 422].includes(error.status))) { setUncertain(true); setNeedsRead(true) }
      return false
    } finally {
      // Commands are serialized by this flag, including across context changes.
      // Release it even when the old result was correctly ignored.
      setIsSaving(false)
    }
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (tutorialActive && guideSelection === 'new' && createdId) return
    await performChange(() => createRecurringExpense(
      currentHousehold.id, toRequest(createDraft),
    ), result => {
      setCreatedId(result.id)
      const next = emptyDraft(defaultScope)
      setCreateDraft(next)
      createGuard.markClean(next)
    })
  }

  const beginEdit = (expense: RecurringExpenseItem) => {
    if (editingId === expense.id || !editGuard.confirmDiscard()) return
    setEditingId(expense.id)
    const next: ExpenseDraft = {
      name: expense.name,
      amount: String(expense.amount),
      scope: expense.scope,
      budgetMode: expense.budgetMode,
      subcategoryId: expense.subcategoryId,
      accountId: expense.accountId ?? '',
      expectedDayOfMonth: expense.expectedDayOfMonth?.toString() ?? '',
      startsOn: expense.startsOn,
      endsOn: expense.endsOn ?? '',
    }
    setEditDraft(next)
    editGuard.markClean(next)
  }

  const handleUpdate = async (id: string) => {
    if (!editDraft) return
    await performChange(() => updateRecurringExpense(
      currentHousehold.id, id, toRequest(editDraft),
    ), () => {
      setEditingId(null)
      setEditDraft(null)
      editGuard.markClean(null)
    })
  }

  const canChange = (expense: RecurringExpenseItem) =>
    expense.scope === 'Personal' || canManageHousehold

  const cancelEdit = () => {
    if (!editGuard.confirmDiscard()) return
    setEditingId(null)
    setEditDraft(null)
    editGuard.markClean(null)
  }

  const renderFields = (
    draft: ExpenseDraft,
    setDraft: (next: ExpenseDraft) => void,
  ) => {
    const availableAccounts = accounts.filter(account =>
      account.isActive && account.currency === currentHousehold.defaultCurrency &&
      account.scope === draft.scope)
    const isSelectedForm = tutorialActive && (guideSelection === 'new' && !createdId && draft === createDraft || editingId === selectedExpense?.id && draft === editDraft)
    const target = (name: string) => isSelectedForm ? `recurring-tour-${name}` : undefined
    return <div className="recurring-form-grid" data-tutorial-id={target('fields')}>
      <label><span>Item name</span><input required maxLength={100} placeholder="Netflix" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label><span>Monthly amount</span><span className="currency-input"><span>{currentHousehold.defaultCurrency}</span><input aria-label="Monthly amount" required type="number" min="0.01" step="0.01" placeholder="0.00" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></span></label>
      <label><span>Scope</span><select value={draft.scope} onChange={event => setDraft({ ...draft, scope: event.target.value as RecurringExpenseScope, accountId: '' })}>{canManageHousehold && <option value="Household">Household/shared</option>}<option value="Personal">Personal/mine</option></select></label>
      <label><span>Subcategory</span><select aria-label="Subcategory" required value={draft.subcategoryId} onChange={event => setDraft({ ...draft, subcategoryId: event.target.value })}><option value="">Select a subcategory</option>{categories.filter(root => root.type === 'Expense' && root.isActive).map(root => <optgroup key={root.id} label={root.name}>{root.children.filter(child => child.isActive).map(child => <option key={child.id} value={child.id}>{child.name}</option>)}</optgroup>)}</select></label>
      <label data-tutorial-id={target('placement')}><span>Budget placement</span><select value={draft.budgetMode} onChange={event => setDraft({ ...draft, budgetMode: event.target.value as RecurringExpenseBudgetMode })}><option value="Detailed">Detailed — budget this subcategory</option><option value="Overall">Overall — roll into the parent category</option></select><small>{draft.budgetMode === 'Detailed' ? 'Creates or adds to the selected subcategory line.' : 'Creates or adds to the parent category total.'}</small></label>
      <label><span>Account (optional)</span><select value={draft.accountId} onChange={event => setDraft({ ...draft, accountId: event.target.value })}><option value="">No account selected</option>{availableAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label><span>Expected day (optional)</span><input type="number" min="1" max="31" placeholder="15" value={draft.expectedDayOfMonth} onChange={event => setDraft({ ...draft, expectedDayOfMonth: event.target.value })} /></label>
      <label data-tutorial-id={target('schedule')}><span>Starts on</span><input required type="date" value={draft.startsOn} onChange={event => setDraft({ ...draft, startsOn: event.target.value })} /></label>
      <label><span>Ends on (optional)</span><input type="date" min={draft.startsOn} value={draft.endsOn} onChange={event => setDraft({ ...draft, endsOn: event.target.value })} /></label>
    </div>
  }

  const monthlyTotal = (scope: RecurringExpenseScope) => expenses
    .filter(expense => expense.isActive && expense.scope === scope)
    .reduce((total, expense) => total + expense.amount, 0)
  const formatMoney = (amount: number) => new Intl.NumberFormat(undefined, {
    style: 'currency', currency: currentHousehold.defaultCurrency,
  }).format(amount)

  const blocked = isSaving || !loadState.isFresh || uncertain
  const chooseGuideItem = (value: string) => {
    if (needsRead) return
    if (!createGuard.confirmDiscard() || !editGuard.confirmDiscard()) return
    if (uncertain && (value === 'new' || !loadState.isFresh)) return
    setGuideSelection(value || null)
    setCreatedId(null)
    setUncertain(false)
    setErrors([])
    const next = emptyDraft(defaultScope)
    setCreateDraft(next)
    createGuard.markClean(next)
    setEditingId(null)
    setEditDraft(null)
    editGuard.markClean(null)
  }

  return <PageFrame contentClassName="recurring-content" footer={<div id="recurring-tutorial-guide-host" />}>
      <BudgetingSectionNav current="recurring-expenses" />
      <div className="page-title-row"><div><p className="eyebrow">Budgeting</p><h1>Recurring expenses</h1><p>Configure predictable monthly expenses once and use them to build future budgets.</p></div><label className="checkbox-row"><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} /><span>Show deactivated</span></label></div>
      {!uncertain && <ErrorSummary errors={errors} />}
      <PageLoadFeedback subject="recurring expenses" status={loadState.status} errors={loadState.errors} onReload={() => void load()} disabled={isSaving} />
      {tutorialActive && <section className="recurring-form" data-tutorial-id="recurring-tour-choice" aria-label="Tutorial item selection">
        <label><span>Use an existing item or add a new one</span><select value={guideSelection ?? ''} disabled={isSaving || !loadState.isFresh || needsRead} onChange={event => chooseGuideItem(event.target.value)}>
          <option value="">Choose an item…</option><option value="new" disabled={uncertain}>{createdId ? 'Use the item just saved' : 'New expectation'}</option>
          {expenses.filter(item => item.isActive && canChange(item)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.scope}</option>)}
        </select></label>
        {guideSelection === 'new' && !createdId && <label><span>New item scope</span><select value={createDraft.scope} onChange={event => setCreateDraft({ ...createDraft, scope: event.target.value as RecurringExpenseScope, accountId: '' })}>
          {canManageHousehold && <option value="Household">Household/shared</option>}<option value="Personal">Personal/mine</option>
        </select></label>}
      </section>}
      {uncertain && <div className="error-summary" role="alert"><p>The request may have saved. Check the list before making another change.</p>
        <button type="button" disabled={isSaving || loadState.isPending} onClick={() => { setErrors([]); void load() }}>Check saved list</button>
        <p>Then restart task selection and choose the saved item. Do not add it again.</p></div>}
      {loadState.hasData && <>
        <div className="recurring-summary"><div><span>Household monthly</span><strong>{formatMoney(monthlyTotal('Household'))}</strong></div><div><span>My personal monthly</span><strong>{formatMoney(monthlyTotal('Personal'))}</strong></div></div>
        <form className="recurring-form" onSubmit={event => void handleCreate(event)}>
          <div className="recurring-form-heading"><div><h2>Add recurring expense</h2><p>This creates an expectation, not a transaction.</p></div><span className="currency-pill">{currentHousehold.defaultCurrency}</span></div>
          {renderFields(createDraft, setCreateDraft)}
          <button className="primary-button account-submit" data-tutorial-id={guideSelection === 'new' && !createdId ? 'recurring-tour-save' : undefined} type="submit" disabled={blocked || Boolean(tutorialActive && guideSelection === 'new' && createdId)}>Add recurring expense</button>
        </form>
        {visibleExpenses.length === 0 ? <div className="empty-state"><h2>No recurring expenses to show</h2><p>Add a monthly item or show deactivated items.</p></div>
          : <div className="recurring-list">{visibleExpenses.map(expense => <article className={`recurring-card${expense.isActive ? '' : ' inactive-row'}`} key={expense.id}
            data-tutorial-id={selectedExpense?.id === expense.id ? 'recurring-tour-selected' : undefined}>
            {editingId === expense.id && editDraft ? <div className="recurring-edit-form">
              {renderFields(editDraft, setEditDraft)}
              <div className="account-actions" data-tutorial-id={selectedExpense?.id === expense.id ? 'recurring-tour-save' : undefined}>
                <button type="button" disabled={blocked || !editDraft.name.trim()} onClick={() => void handleUpdate(expense.id)}>Save changes</button>
                <button className="text-button" type="button" disabled={isSaving} onClick={cancelEdit}>Cancel</button>
              </div>
            </div> : <>
              <div className="recurring-card-main"><div><div className="account-name-line"><h3>{expense.name}</h3>{!expense.isActive && <span className="status-pill">Deactivated</span>}</div>
                <p>{expense.categoryName} → {expense.subcategoryName}</p><small>{expense.scope} · {expense.budgetMode} budget{expense.accountName ? ` · ${expense.accountName}` : ''}{expense.expectedDayOfMonth ? ` · Expected day ${expense.expectedDayOfMonth}` : ''}</small>
                <small>From {expense.startsOn}{expense.endsOn ? ` through ${expense.endsOn}` : ''}</small></div><strong>{formatMoney(expense.amount)}<small>/month</small></strong></div>
              {canChange(expense) && <div className="account-actions"><button className="text-button" type="button" disabled={blocked} onClick={() => beginEdit(expense)}>Edit</button>
                <button className="text-button" type="button" disabled={blocked} onClick={() => void performChange(() => setRecurringExpenseActive(currentHousehold.id, expense.id, !expense.isActive))}>{expense.isActive ? 'Deactivate' : 'Reactivate'}</button></div>}
            </>}
          </article>)}</div>}
      </>}
  </PageFrame>
}
