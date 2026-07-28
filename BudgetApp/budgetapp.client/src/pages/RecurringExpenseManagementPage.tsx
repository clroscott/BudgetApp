import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import {
  createRecurringExpense,
  getRecurringExpenses,
  setRecurringExpenseActive,
  updateRecurringExpense,
  type RecurringExpenseItem,
  type RecurringExpenseRequest,
  type RecurringExpenseScope,
} from '../recurringExpenses/recurringExpenseApi'
import { AppLink } from '../routing/AppLink'

interface ExpenseDraft {
  name: string
  amount: string
  scope: RecurringExpenseScope
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
    name: '', amount: '', scope, subcategoryId: '', accountId: '',
    expectedDayOfMonth: '', startsOn: localDate(), endsOn: '',
  }
}

function toRequest(draft: ExpenseDraft): RecurringExpenseRequest {
  return {
    name: draft.name,
    amount: Number(draft.amount),
    scope: draft.scope,
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
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!currentHousehold) return
    setIsLoading(true)
    setErrors([])
    try {
      const [expenseItems, categoryItems, accountItems] = await Promise.all([
        getRecurringExpenses(currentHousehold.id),
        getCategories(currentHousehold.id),
        getAccounts(currentHousehold.id),
      ])
      setExpenses(expenseItems)
      setCategories(categoryItems)
      setAccounts(accountItems)
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsLoading(false)
    }
  }, [currentHousehold])

  useEffect(() => { void load() }, [load])

  const visibleExpenses = useMemo(
    () => expenses.filter(expense => showInactive || expense.isActive),
    [expenses, showInactive],
  )

  if (!currentHousehold) return null

  const performChange = async (change: () => Promise<unknown>): Promise<boolean> => {
    setIsSaving(true)
    setErrors([])
    try {
      await change()
      await load()
      return true
    } catch (error) {
      setErrors(getErrorMessages(error))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const succeeded = await performChange(() => createRecurringExpense(
      currentHousehold.id, toRequest(createDraft),
    ))
    if (succeeded) setCreateDraft(emptyDraft(defaultScope))
  }

  const beginEdit = (expense: RecurringExpenseItem) => {
    setEditingId(expense.id)
    setEditDraft({
      name: expense.name,
      amount: String(expense.amount),
      scope: expense.scope,
      subcategoryId: expense.subcategoryId,
      accountId: expense.accountId ?? '',
      expectedDayOfMonth: expense.expectedDayOfMonth?.toString() ?? '',
      startsOn: expense.startsOn,
      endsOn: expense.endsOn ?? '',
    })
  }

  const handleUpdate = async (id: string) => {
    if (!editDraft) return
    const succeeded = await performChange(() => updateRecurringExpense(
      currentHousehold.id, id, toRequest(editDraft),
    ))
    if (succeeded) {
      setEditingId(null)
      setEditDraft(null)
    }
  }

  const canChange = (expense: RecurringExpenseItem) =>
    expense.scope === 'Personal' || canManageHousehold

  const renderFields = (
    draft: ExpenseDraft,
    setDraft: (next: ExpenseDraft) => void,
  ) => {
    const availableAccounts = accounts.filter(account =>
      account.isActive && account.currency === currentHousehold.defaultCurrency &&
      account.scope === draft.scope)
    return <div className="recurring-form-grid">
      <label><span>Item name</span><input required maxLength={100} placeholder="Netflix" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label><span>Monthly amount</span><span className="currency-input"><span>{currentHousehold.defaultCurrency}</span><input required type="number" min="0.01" step="0.01" placeholder="0.00" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></span></label>
      <label><span>Scope</span><select value={draft.scope} onChange={event => setDraft({ ...draft, scope: event.target.value as RecurringExpenseScope, accountId: '' })}>{canManageHousehold && <option value="Household">Household/shared</option>}<option value="Personal">Personal/mine</option></select></label>
      <label><span>Subcategory</span><select required value={draft.subcategoryId} onChange={event => setDraft({ ...draft, subcategoryId: event.target.value })}><option value="">Select a subcategory</option>{categories.filter(root => root.type === 'Expense' && root.isActive).map(root => <optgroup key={root.id} label={root.name}>{root.children.filter(child => child.isActive).map(child => <option key={child.id} value={child.id}>{child.name}</option>)}</optgroup>)}</select></label>
      <label><span>Account (optional)</span><select value={draft.accountId} onChange={event => setDraft({ ...draft, accountId: event.target.value })}><option value="">No account selected</option>{availableAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label><span>Expected day (optional)</span><input type="number" min="1" max="31" placeholder="15" value={draft.expectedDayOfMonth} onChange={event => setDraft({ ...draft, expectedDayOfMonth: event.target.value })} /></label>
      <label><span>Starts on</span><input required type="date" value={draft.startsOn} onChange={event => setDraft({ ...draft, startsOn: event.target.value })} /></label>
      <label><span>Ends on (optional)</span><input type="date" min={draft.startsOn} value={draft.endsOn} onChange={event => setDraft({ ...draft, endsOn: event.target.value })} /></label>
    </div>
  }

  const monthlyTotal = (scope: RecurringExpenseScope) => expenses
    .filter(expense => expense.isActive && expense.scope === scope)
    .reduce((total, expense) => total + expense.amount, 0)
  const formatMoney = (amount: number) => new Intl.NumberFormat(undefined, {
    style: 'currency', currency: currentHousehold.defaultCurrency,
  }).format(amount)

  return <main className="management-page">
    <header className="app-header"><BrandLockup /><AppLink className="header-link" to="/budgeting">Monthly budget</AppLink></header>
    <section className="management-content recurring-content">
      <div className="page-title-row"><div><p className="eyebrow">Budgeting</p><h1>Recurring expenses</h1><p>Configure predictable monthly expenses once and use them to build future budgets.</p></div><label className="checkbox-row"><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} /><span>Show deactivated</span></label></div>
      <ErrorSummary errors={errors} />
      <div className="recurring-summary"><div><span>Household monthly</span><strong>{formatMoney(monthlyTotal('Household'))}</strong></div><div><span>My personal monthly</span><strong>{formatMoney(monthlyTotal('Personal'))}</strong></div></div>
      <form className="recurring-form" onSubmit={event => void handleCreate(event)}><div className="recurring-form-heading"><div><h2>Add recurring expense</h2><p>This creates an expectation, not a transaction.</p></div><span className="currency-pill">{currentHousehold.defaultCurrency}</span></div>{renderFields(createDraft, setCreateDraft)}<button className="primary-button account-submit" type="submit" disabled={isSaving}>Add recurring expense</button></form>
      {isLoading ? <p className="empty-state">Loading recurring expenses...</p> : visibleExpenses.length === 0 ? <div className="empty-state"><h2>No recurring expenses to show</h2><p>Add a monthly item or show deactivated items.</p></div> : <div className="recurring-list">{visibleExpenses.map(expense => <article className={`recurring-card${expense.isActive ? '' : ' inactive-row'}`} key={expense.id}>{editingId === expense.id && editDraft ? <div className="recurring-edit-form">{renderFields(editDraft, setEditDraft)}<div className="account-actions"><button type="button" disabled={isSaving || !editDraft.name.trim()} onClick={() => void handleUpdate(expense.id)}>Save changes</button><button className="text-button" type="button" disabled={isSaving} onClick={() => { setEditingId(null); setEditDraft(null) }}>Cancel</button></div></div> : <><div className="recurring-card-main"><div><div className="account-name-line"><h3>{expense.name}</h3>{!expense.isActive && <span className="status-pill">Deactivated</span>}</div><p>{expense.categoryName} → {expense.subcategoryName}</p><small>{expense.scope}{expense.accountName ? ` · ${expense.accountName}` : ''}{expense.expectedDayOfMonth ? ` · Expected day ${expense.expectedDayOfMonth}` : ''}</small><small>From {expense.startsOn}{expense.endsOn ? ` through ${expense.endsOn}` : ''}</small></div><strong>{formatMoney(expense.amount)}<small>/month</small></strong></div>{canChange(expense) && <div className="account-actions"><button className="text-button" type="button" disabled={isSaving} onClick={() => beginEdit(expense)}>Edit</button><button className="text-button" type="button" disabled={isSaving} onClick={() => void performChange(() => setRecurringExpenseActive(currentHousehold.id, expense.id, !expense.isActive))}>{expense.isActive ? 'Deactivate' : 'Reactivate'}</button></div>}</>}</article>)}</div>}
    </section>
  </main>
}
