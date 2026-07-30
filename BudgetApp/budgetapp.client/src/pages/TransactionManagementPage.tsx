import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { getCategories, type CategoryItem, type CategoryType } from '../categories/categoryApi'
import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import {
  downloadTransactionsCsv,
  getTransactions,
  updateTransaction,
  type TransactionItem,
  type TransactionQuery,
  type UpdateTransactionRequest,
} from '../transactions/transactionApi'

type DateFilterMode = 'pastDays' | 'specificDate' | 'specificMonth' | 'range' | 'all'
const uncategorizedFilterValue = '__uncategorized__'

interface TransactionFilters {
  accountId: string
  dateMode: DateFilterMode
  pastDays: string
  specificDate: string
  specificMonth: string
  fromDate: string
  toDate: string
  categoryType: CategoryType | ''
  categoryId: string
  subcategoryId: string
  description: string
}

interface PaginationState {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function createDefaultFilters(): TransactionFilters {
  const today = new Date()
  return {
    accountId: '',
    dateMode: 'pastDays',
    pastDays: '30',
    specificDate: formatLocalDate(today),
    specificMonth: formatLocalDate(today).slice(0, 7),
    fromDate: formatLocalDate(addDays(today, -29)),
    toDate: formatLocalDate(today),
    categoryType: '',
    categoryId: '',
    subcategoryId: '',
    description: '',
  }
}

function createInitialFilters(): TransactionFilters {
  const defaults = createDefaultFilters()
  const search = new URLSearchParams(window.location.search)
  const fromDate = search.get('fromDate') ?? ''
  const toDate = search.get('toDate') ?? ''
  const categoryId = search.get('categoryId') ?? ''
  const uncategorizedOnly = search.get('uncategorizedOnly') === 'true'
  if (!fromDate || !toDate) return defaults

  return {
    ...defaults,
    dateMode: 'range',
    fromDate,
    toDate,
    categoryId: uncategorizedOnly ? uncategorizedFilterValue : categoryId,
  }
}

function buildTransactionQuery(filters: TransactionFilters, page: number): TransactionQuery {
  const query: TransactionQuery = {
    accountId: filters.accountId || undefined,
    categoryType: filters.categoryType || undefined,
    categoryId: filters.categoryId === uncategorizedFilterValue
      ? undefined
      : filters.subcategoryId || filters.categoryId || undefined,
    uncategorizedOnly: filters.categoryId === uncategorizedFilterValue || undefined,
    description: filters.description.trim() || undefined,
    page,
  }

  if (filters.dateMode === 'pastDays') {
    const days = Number(filters.pastDays)
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new Error('Past days must be a whole number between 1 and 3,650.')
    }
    const today = new Date()
    query.fromDate = formatLocalDate(addDays(today, -(days - 1)))
    query.toDate = formatLocalDate(today)
  } else if (filters.dateMode === 'specificDate') {
    if (!filters.specificDate) throw new Error('Choose a specific date.')
    query.fromDate = filters.specificDate
    query.toDate = filters.specificDate
  } else if (filters.dateMode === 'specificMonth') {
    if (!filters.specificMonth) throw new Error('Choose a specific month.')
    const [year, month] = filters.specificMonth.split('-').map(Number)
    query.fromDate = `${filters.specificMonth}-01`
    query.toDate = formatLocalDate(new Date(year, month, 0))
  } else if (filters.dateMode === 'range') {
    if (!filters.fromDate || !filters.toDate) {
      throw new Error('Choose both a start date and an end date.')
    }
    if (filters.fromDate > filters.toDate) {
      throw new Error('Start date cannot be after end date.')
    }
    query.fromDate = filters.fromDate
    query.toDate = filters.toDate
  }

  return query
}

function findCategorySelection(categories: CategoryItem[], selectedCategoryId: string | null) {
  if (!selectedCategoryId) return { categoryId: '', subcategoryId: '' }
  for (const category of categories) {
    if (category.id === selectedCategoryId) {
      return { categoryId: category.id, subcategoryId: '' }
    }
    if (category.children.some(child => child.id === selectedCategoryId)) {
      return { categoryId: category.id, subcategoryId: selectedCategoryId }
    }
  }
  return { categoryId: '', subcategoryId: '' }
}

function categoryLabel(categories: CategoryItem[], selectedCategoryId: string | null) {
  const selection = findCategorySelection(categories, selectedCategoryId)
  const category = categories.find(item => item.id === selection.categoryId)
  const subcategory = category?.children.find(item => item.id === selection.subcategoryId)
  return [category?.name, subcategory?.name].filter(Boolean).join(' / ') || 'Uncategorized'
}

function toEditRequest(transaction: TransactionItem): UpdateTransactionRequest {
  return {
    categoryId: transaction.categoryId,
    transactionDate: transaction.transactionDate,
    postedDate: transaction.postedDate,
    amount: transaction.amount,
    description: transaction.description,
    merchantName: transaction.merchantName,
    notes: transaction.notes,
    isExcludedFromBudget: transaction.isExcludedFromBudget,
  }
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
}

export function TransactionManagementPage() {
  const { currentHousehold } = useHouseholds()
  const initialFilters = useMemo(createInitialFilters, [])
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters)
  const [appliedQuery, setAppliedQuery] = useState<TransactionQuery>(
    () => buildTransactionQuery(initialFilters, 1),
  )
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 100,
    totalCount: 0,
    totalPages: 0,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRequest, setEditRequest] = useState<UpdateTransactionRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!currentHousehold) return
    let isCurrent = true
    void Promise.all([
      getAccounts(currentHousehold.id),
      getCategories(currentHousehold.id),
    ]).then(([accountItems, categoryItems]) => {
      if (!isCurrent) return
      setAccounts(accountItems)
      setCategories(categoryItems)
      setFilters(current => {
        const selectedId = current.subcategoryId || current.categoryId
        if (!selectedId || selectedId === uncategorizedFilterValue) return current
        return {
          ...current,
          ...findCategorySelection(categoryItems, selectedId),
        }
      })
    }).catch(error => {
      if (isCurrent) setErrors(getErrorMessages(error))
    })
    return () => { isCurrent = false }
  }, [currentHousehold])

  useEffect(() => {
    if (!currentHousehold) return
    let isCurrent = true
    setIsLoading(true)
    setErrors([])
    void getTransactions(currentHousehold.id, appliedQuery)
      .then(result => {
        if (!isCurrent) return
        setTransactions(result.items)
        setPagination({
          page: result.page,
          pageSize: result.pageSize,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
        })
      })
      .catch(error => {
        if (isCurrent) setErrors(getErrorMessages(error))
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [appliedQuery, currentHousehold])

  const editingTransaction = useMemo(
    () => transactions.find(transaction => transaction.id === editingId) ?? null,
    [editingId, transactions],
  )
  const isEditDirty = editingTransaction !== null && editRequest !== null &&
    JSON.stringify(editRequest) !== JSON.stringify(toEditRequest(editingTransaction))
  const filterCategories = categories.filter(category =>
    !filters.categoryType || category.type === filters.categoryType)
  const filterSubcategories = categories.find(category =>
    category.id === filters.categoryId)?.children ?? []
  const editCategorySelection = findCategorySelection(categories, editRequest?.categoryId ?? null)
  const editSubcategories = categories.find(category =>
    category.id === editCategorySelection.categoryId)?.children ?? []

  if (!currentHousehold) return null

  const cancelEditing = () => {
    setEditingId(null)
    setEditRequest(null)
  }

  const confirmDiscardEdit = () => {
    if (isEditDirty && !window.confirm('Discard the unsaved transaction changes?')) {
      return false
    }
    cancelEditing()
    return true
  }

  const startEditing = (transaction: TransactionItem) => {
    if (editingId === transaction.id) return
    if (!confirmDiscardEdit()) return
    setEditingId(transaction.id)
    setEditRequest(toEditRequest(transaction))
    setErrors([])
  }

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!confirmDiscardEdit()) return
    setErrors([])
    try {
      setAppliedQuery(buildTransactionQuery(filters, 1))
    } catch (error) {
      setErrors(getErrorMessages(error))
    }
  }

  const handleResetFilters = () => {
    if (!confirmDiscardEdit()) return
    const defaults = createDefaultFilters()
    setFilters(defaults)
    setAppliedQuery(buildTransactionQuery(defaults, 1))
    setErrors([])
  }

  const changePage = (page: number) => {
    if (!confirmDiscardEdit()) return
    setAppliedQuery(current => ({ ...current, page }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingId || !editRequest) return
    if (!editRequest.description.trim()) {
      setErrors(['Description is required.'])
      return
    }
    if (!Number.isFinite(editRequest.amount) || editRequest.amount === 0) {
      setErrors(['Amount must be a non-zero number.'])
      return
    }

    setIsSaving(true)
    setErrors([])
    const normalizedRequest = {
      ...editRequest,
      description: editRequest.description.trim(),
      merchantName: editRequest.merchantName?.trim() || null,
      notes: editRequest.notes?.trim() || null,
    }
    try {
      await updateTransaction(currentHousehold.id, editingId, normalizedRequest)
      setTransactions(current => current.map(transaction =>
        transaction.id === editingId
          ? {
              ...transaction,
              ...normalizedRequest,
              categoryName: categoryLabel(categories, normalizedRequest.categoryId),
            }
          : transaction))
      cancelEditing()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    if (isEditDirty && !window.confirm(
      'The export contains saved transactions only. Continue without saving your current edit?',
    )) {
      return
    }

    setIsExporting(true)
    setErrors([])
    try {
      await downloadTransactionsCsv(currentHousehold.id, appliedQuery)
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsExporting(false)
    }
  }

  const firstResult = pagination.totalCount === 0
    ? 0
    : (pagination.page - 1) * pagination.pageSize + 1
  const lastResult = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalCount,
  )

  return (
    <main className="management-page">
      <header className="app-header">
        <BrandLockup />
        <AppLink className="header-link" to="/dashboard">Return to dashboard</AppLink>
      </header>

      <section className="management-content transaction-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Household activity</p>
            <h1>Transactions</h1>
            <p>Search and edit transactions in BudgetApp while preserving their import history.</p>
          </div>
          <AppLink to="/import">Import CSV</AppLink>
        </div>

        <ErrorSummary errors={errors} />

        <form className="transaction-filter-panel" onSubmit={handleApplyFilters}>
          <div className="transaction-filter-grid">
            <label>
              <span>Account</span>
              <select value={filters.accountId} onChange={event =>
                setFilters({ ...filters, accountId: event.target.value })}>
                <option value="">All visible accounts</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Date filter</span>
              <select value={filters.dateMode} onChange={event =>
                setFilters({ ...filters, dateMode: event.target.value as DateFilterMode })}>
                <option value="pastDays">Past X days</option>
                <option value="specificDate">Specific date</option>
                <option value="specificMonth">Specific month</option>
                <option value="range">Date range</option>
                <option value="all">All dates</option>
              </select>
            </label>
            {filters.dateMode === 'pastDays' && (
              <label>
                <span>Number of days</span>
                <input type="number" min="1" max="3650" step="1" required
                  value={filters.pastDays} onChange={event =>
                    setFilters({ ...filters, pastDays: event.target.value })} />
              </label>
            )}
            {filters.dateMode === 'specificDate' && (
              <label>
                <span>Date</span>
                <input type="date" required value={filters.specificDate} onChange={event =>
                  setFilters({ ...filters, specificDate: event.target.value })} />
              </label>
            )}
            {filters.dateMode === 'specificMonth' && (
              <label>
                <span>Month</span>
                <input type="month" required value={filters.specificMonth} onChange={event =>
                  setFilters({ ...filters, specificMonth: event.target.value })} />
              </label>
            )}
            {filters.dateMode === 'range' && (
              <>
                <label>
                  <span>From</span>
                  <input type="date" required value={filters.fromDate} onChange={event =>
                    setFilters({ ...filters, fromDate: event.target.value })} />
                </label>
                <label>
                  <span>To</span>
                  <input type="date" required value={filters.toDate} onChange={event =>
                    setFilters({ ...filters, toDate: event.target.value })} />
                </label>
              </>
            )}
            <label>
              <span>Category type</span>
              <select value={filters.categoryType} onChange={event => setFilters({
                ...filters,
                categoryType: event.target.value as CategoryType | '',
                categoryId: '',
                subcategoryId: '',
              })}>
                <option value="">All types</option>
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
                <option value="Transfer">Transfer</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select value={filters.categoryId} onChange={event => setFilters({
                ...filters,
                categoryId: event.target.value,
                subcategoryId: '',
                categoryType: event.target.value === uncategorizedFilterValue
                  ? ''
                  : filters.categoryType,
              })}>
                <option value="">All categories</option>
                <option value={uncategorizedFilterValue}>Uncategorized only</option>
                {filterCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.isActive ? '' : ' (deactivated)'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subcategory</span>
              <select value={filters.subcategoryId} disabled={
                !filters.categoryId ||
                filters.categoryId === uncategorizedFilterValue
              }
                onChange={event => setFilters({ ...filters, subcategoryId: event.target.value })}>
                <option value="">All subcategories</option>
                {filterSubcategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.isActive ? '' : ' (deactivated)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="transaction-description-filter">
              <span>Description contains</span>
              <input maxLength={250} value={filters.description} onChange={event =>
                setFilters({ ...filters, description: event.target.value })}
                placeholder="Merchant or description" />
            </label>
          </div>
          <div className="transaction-filter-actions">
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Searching...' : 'Apply filters'}
            </button>
            <button className="secondary-button" type="button" disabled={isLoading}
              onClick={handleResetFilters}>
              Reset filters
            </button>
            <button className="secondary-button" type="button"
              disabled={isLoading || isExporting} onClick={() => void handleExport()}>
              {isExporting ? 'Preparing export...' : 'Export matching transactions'}
            </button>
          </div>
        </form>

        {!isLoading && (
          <p className="transaction-result-summary">
            Showing {firstResult}–{lastResult} of {pagination.totalCount} matching transactions
          </p>
        )}

        {isLoading ? (
          <p className="empty-state">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <h2>No matching transactions</h2>
            <p>Change the filters or import and approve additional transactions.</p>
          </div>
        ) : (
          <div className="transaction-list">
            {transactions.map(transaction => (
              <Fragment key={transaction.id}>
                <article
                  className={`transaction-row${transaction.isVoided ? ' transaction-row-voided' : ''}`}
                >
                  <div className="transaction-date">
                    <strong>{transaction.transactionDate}</strong>
                    <small>{transaction.accountName}</small>
                  </div>
                  <div className="transaction-description">
                    <strong>{transaction.description}</strong>
                    <small>{categoryLabel(categories, transaction.categoryId)} · {transaction.source}</small>
                  </div>
                  <strong className={transaction.amount < 0 ? 'amount-out' : 'amount-in'}>
                    {formatAmount(transaction.amount, transaction.currency)}
                  </strong>
                  <div className="transaction-flags">
                    {transaction.isExcludedFromBudget && <span>Excluded</span>}
                    {transaction.isVoided && <span>Voided</span>}
                  </div>
                  {transaction.canEdit ? (
                    <button className="text-button" type="button"
                      onClick={() => startEditing(transaction)}>
                      Edit
                    </button>
                  ) : <small>View only</small>}
                </article>

                {editingId === transaction.id && editRequest && (
                  <form className="transaction-edit-form transaction-inline-edit"
                    onSubmit={(event) => void handleSave(event)}>
                    <div className="page-title-row">
                      <div>
                        <p className="eyebrow">Edit transaction</p>
                        <h2>{transaction.description}</h2>
                      </div>
                      <button className="text-button" type="button"
                        onClick={() => void confirmDiscardEdit()}>
                        Cancel
                      </button>
                    </div>

                    <div className="transaction-edit-grid">
                      <label>
                        <span>Transaction date</span>
                        <input type="date" required value={editRequest.transactionDate}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            transactionDate: event.target.value,
                          })} />
                      </label>
                      <label>
                        <span>Posted date</span>
                        <input type="date" value={editRequest.postedDate ?? ''}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            postedDate: event.target.value || null,
                          })} />
                      </label>
                      <label>
                        <span>Amount</span>
                        <input type="number" step="0.0001" required value={editRequest.amount}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            amount: event.target.valueAsNumber,
                          })} />
                        <small>Positive is spending; negative is income, a refund, or a credit.</small>
                      </label>
                      <label>
                        <span>Category</span>
                        <select value={editCategorySelection.categoryId}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            categoryId: event.target.value || null,
                          })}>
                          <option value="">Uncategorized</option>
                          {categories
                            .filter(category => category.isActive ||
                              category.id === editCategorySelection.categoryId)
                            .map(category => (
                              <option key={category.id} value={category.id}>
                                {category.name}{category.isActive ? '' : ' (deactivated)'}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        <span>Subcategory</span>
                        <select value={editCategorySelection.subcategoryId}
                          disabled={!editCategorySelection.categoryId}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            categoryId: event.target.value || editCategorySelection.categoryId || null,
                          })}>
                          <option value="">None</option>
                          {editSubcategories
                            .filter(category => category.isActive ||
                              category.id === editCategorySelection.subcategoryId)
                            .map(category => (
                              <option key={category.id} value={category.id}>
                                {category.name}{category.isActive ? '' : ' (deactivated)'}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="transaction-wide-field">
                        <span>Description</span>
                        <input maxLength={250} required value={editRequest.description}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            description: event.target.value,
                          })} />
                      </label>
                      <label className="transaction-wide-field">
                        <span>Merchant name</span>
                        <input maxLength={200} value={editRequest.merchantName ?? ''}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            merchantName: event.target.value || null,
                          })} />
                      </label>
                      <label className="transaction-wide-field">
                        <span>Notes</span>
                        <textarea maxLength={1000} rows={3} value={editRequest.notes ?? ''}
                          onChange={event => setEditRequest({
                            ...editRequest,
                            notes: event.target.value || null,
                          })} />
                      </label>
                    </div>

                    <label className="checkbox-row">
                      <input type="checkbox" checked={editRequest.isExcludedFromBudget}
                        onChange={event => setEditRequest({
                          ...editRequest,
                          isExcludedFromBudget: event.target.checked,
                        })} />
                      <span>Exclude this transaction from budget totals</span>
                    </label>

                    <button className="primary-button" type="submit" disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Save transaction'}
                    </button>
                  </form>
                )}
              </Fragment>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <nav className="transaction-pagination" aria-label="Transaction result pages">
            <button className="secondary-button" type="button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => changePage(pagination.page - 1)}>
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button className="secondary-button" type="button"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => changePage(pagination.page + 1)}>
              Next
            </button>
          </nav>
        )}
      </section>
    </main>
  )
}
