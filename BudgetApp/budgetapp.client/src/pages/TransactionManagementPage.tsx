import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import {
  getTransactions,
  updateTransaction,
  type TransactionItem,
  type UpdateTransactionRequest,
} from '../transactions/transactionApi'

interface CategoryOption {
  id: string
  label: string
  isActive: boolean
}

function flattenCategories(categories: CategoryItem[]): CategoryOption[] {
  return categories.flatMap(category => [
    { id: category.id, label: category.name, isActive: category.isActive },
    ...category.children.map(child => ({
      id: child.id,
      label: `${category.name} / ${child.name}`,
      isActive: child.isActive,
    })),
  ])
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
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRequest, setEditRequest] = useState<UpdateTransactionRequest | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!currentHousehold) return

    let isCurrent = true
    setIsLoading(true)
    setErrors([])
    void Promise.all([
      getTransactions(currentHousehold.id, selectedAccountId || undefined),
      getAccounts(currentHousehold.id),
      getCategories(currentHousehold.id),
    ])
      .then(([transactionResult, accountItems, categoryItems]) => {
        if (!isCurrent) return
        setTransactions(transactionResult.items)
        setHasMore(transactionResult.hasMore)
        setAccounts(accountItems)
        setCategories(flattenCategories(categoryItems))
      })
      .catch(error => {
        if (isCurrent) setErrors(getErrorMessages(error))
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => { isCurrent = false }
  }, [currentHousehold, selectedAccountId])

  const editingTransaction = useMemo(
    () => transactions.find(transaction => transaction.id === editingId) ?? null,
    [editingId, transactions],
  )

  if (!currentHousehold) return null

  const cancelEditing = () => {
    setEditingId(null)
    setEditRequest(null)
  }

  const startEditing = (transaction: TransactionItem) => {
    setEditingId(transaction.id)
    setEditRequest(toEditRequest(transaction))
    setErrors([])
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
              categoryName: categories.find(category =>
                category.id === normalizedRequest.categoryId)?.label ?? null,
            }
          : transaction))
      cancelEditing()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="management-page">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BudgetApp</span>
        </div>
        <AppLink className="header-link" to="/dashboard">Dashboard</AppLink>
      </header>

      <section className="management-content transaction-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Household activity</p>
            <h1>Transactions</h1>
            <p>Review and correct official transactions without changing their import history.</p>
          </div>
          <AppLink to="/import">Import CSV</AppLink>
        </div>

        <ErrorSummary errors={errors} />

        <label className="transaction-account-filter">
          <span>Account</span>
          <select value={selectedAccountId} onChange={event => {
            setSelectedAccountId(event.target.value)
            cancelEditing()
          }}>
            <option value="">All visible accounts</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>

        {isLoading ? (
          <p className="empty-state">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <h2>No official transactions yet</h2>
            <p>Uploaded rows appear here only after they have been reviewed and approved.</p>
            <AppLink to="/import">Import a CSV</AppLink>
          </div>
        ) : (
          <div className="transaction-list">
            {transactions.map(transaction => (
              <article
                className={`transaction-row${transaction.isVoided ? ' transaction-row-voided' : ''}`}
                key={transaction.id}
              >
                <div className="transaction-date">
                  <strong>{transaction.transactionDate}</strong>
                  <small>{transaction.accountName}</small>
                </div>
                <div className="transaction-description">
                  <strong>{transaction.description}</strong>
                  <small>{transaction.categoryName ?? 'Uncategorized'} · {transaction.source}</small>
                </div>
                <strong className={transaction.amount < 0 ? 'amount-out' : 'amount-in'}>
                  {formatAmount(transaction.amount, transaction.currency)}
                </strong>
                <div className="transaction-flags">
                  {transaction.isExcludedFromBudget && <span>Excluded</span>}
                  {transaction.isVoided && <span>Voided</span>}
                </div>
                {transaction.canEdit ? (
                  <button className="text-button" type="button" onClick={() => startEditing(transaction)}>
                    Edit
                  </button>
                ) : <small>View only</small>}
              </article>
            ))}
          </div>
        )}

        {hasMore && (
          <p className="field-help">Showing the newest 200 transactions. More filters and paging will be added later.</p>
        )}

        {editingTransaction && editRequest && (
          <form className="transaction-edit-form" onSubmit={(event) => void handleSave(event)}>
            <div className="page-title-row">
              <div>
                <p className="eyebrow">Edit transaction</p>
                <h2>{editingTransaction.description}</h2>
              </div>
              <button className="text-button" type="button" onClick={cancelEditing}>Cancel</button>
            </div>

            <div className="transaction-edit-grid">
              <label>
                <span>Transaction date</span>
                <input type="date" required value={editRequest.transactionDate}
                  onChange={event => setEditRequest({ ...editRequest, transactionDate: event.target.value })} />
              </label>
              <label>
                <span>Posted date</span>
                <input type="date" value={editRequest.postedDate ?? ''}
                  onChange={event => setEditRequest({ ...editRequest, postedDate: event.target.value || null })} />
              </label>
              <label>
                <span>Amount</span>
                <input type="number" step="0.0001" required value={editRequest.amount}
                  onChange={event => setEditRequest({ ...editRequest, amount: event.target.valueAsNumber })} />
                <small>Negative is money out; positive is money in.</small>
              </label>
              <label>
                <span>Category</span>
                <select value={editRequest.categoryId ?? ''}
                  onChange={event => setEditRequest({ ...editRequest, categoryId: event.target.value || null })}>
                  <option value="">Uncategorized</option>
                  {categories
                    .filter(category => category.isActive || category.id === editingTransaction.categoryId)
                    .map(category => (
                      <option key={category.id} value={category.id}>
                        {category.label}{category.isActive ? '' : ' (deactivated)'}
                      </option>
                    ))}
                </select>
              </label>
              <label className="transaction-wide-field">
                <span>Description</span>
                <input maxLength={250} required value={editRequest.description}
                  onChange={event => setEditRequest({ ...editRequest, description: event.target.value })} />
              </label>
              <label className="transaction-wide-field">
                <span>Merchant name</span>
                <input maxLength={200} value={editRequest.merchantName ?? ''}
                  onChange={event => setEditRequest({ ...editRequest, merchantName: event.target.value || null })} />
              </label>
              <label className="transaction-wide-field">
                <span>Notes</span>
                <textarea maxLength={1000} rows={3} value={editRequest.notes ?? ''}
                  onChange={event => setEditRequest({ ...editRequest, notes: event.target.value || null })} />
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
      </section>
    </main>
  )
}
