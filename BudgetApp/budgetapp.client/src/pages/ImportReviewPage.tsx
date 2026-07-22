import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import {
  checkImportDuplicates,
  completeImport,
  discardImport,
  getImport,
  getImports,
  reviewImportDraft,
  updateImportDraft,
  type ImportDraftItem,
  type ImportListItem,
  type ImportReviewDetail,
} from '../imports/importApi'
import { AppLink } from '../routing/AppLink'

const rowsPerPage = 50

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

function selectedImportFromUrl() {
  return new URLSearchParams(window.location.search).get('importId') ?? ''
}

interface DraftRowProps {
  householdId: string
  importFileId: string
  draft: ImportDraftItem
  categories: CategoryItem[]
  canEdit: boolean
  isCompleted: boolean
  onChanged: () => Promise<void>
  onError: (error: unknown) => void
}

function DraftRow({
  householdId,
  importFileId,
  draft,
  categories,
  canEdit,
  isCompleted,
  onChanged,
  onError,
}: DraftRowProps) {
  const savedCategorySelection = findCategorySelection(categories, draft.selectedCategoryId)
  const [transactionDate, setTransactionDate] = useState(draft.transactionDate ?? '')
  const [amount, setAmount] = useState(draft.amount?.toString() ?? '')
  const [description, setDescription] = useState(draft.description ?? '')
  const [categoryId, setCategoryId] = useState(savedCategorySelection.categoryId)
  const [subcategoryId, setSubcategoryId] = useState(savedCategorySelection.subcategoryId)
  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = useState(
    draft.isDuplicateAcknowledged,
  )
  const [isBusy, setIsBusy] = useState(false)
  const editable = canEdit && !isCompleted && !draft.approvedTransactionId
  const selectedCategoryId = subcategoryId || categoryId || null
  const subcategories = categories.find(category => category.id === categoryId)?.children ?? []
  const isDirty =
    transactionDate !== (draft.transactionDate ?? '') ||
    amount !== (draft.amount?.toString() ?? '') ||
    description !== (draft.description ?? '') ||
    selectedCategoryId !== draft.selectedCategoryId

  const resetChanges = () => {
    const savedSelection = findCategorySelection(categories, draft.selectedCategoryId)
    setTransactionDate(draft.transactionDate ?? '')
    setAmount(draft.amount?.toString() ?? '')
    setDescription(draft.description ?? '')
    setCategoryId(savedSelection.categoryId)
    setSubcategoryId(savedSelection.subcategoryId)
    setAcknowledgeDuplicate(draft.isDuplicateAcknowledged)
  }

  const persistVisibleValues = async () => {
    const parsedAmount = amount.trim() === '' ? null : Number(amount)
    if (parsedAmount !== null && !Number.isFinite(parsedAmount)) {
      throw new Error('Amount must be a number.')
    }

    await updateImportDraft(householdId, importFileId, draft.id, {
      transactionDate: transactionDate || null,
      amount: parsedAmount,
      description: description.trim() || null,
      selectedCategoryId,
    })
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsBusy(true)
    try {
      await persistVisibleValues()
      await onChanged()
    } catch (error) {
      onError(error)
    } finally {
      setIsBusy(false)
    }
  }

  const decide = async (decision: 'Approved' | 'Rejected' | 'Skipped') => {
    setIsBusy(true)
    try {
      if (decision === 'Approved' && isDirty) {
        await persistVisibleValues()
      }
      await reviewImportDraft(
        householdId,
        importFileId,
        draft.id,
        decision,
        acknowledgeDuplicate,
      )
      await onChanged()
    } catch (error) {
      onError(error)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <article className={`import-draft-card import-decision-${draft.reviewDecision.toLowerCase()}`}>
      <div className="import-draft-heading">
        <div>
          <strong>CSV row {draft.sourceRowNumber}</strong>
          <span>{draft.reviewDecision}</span>
        </div>
        <div className="import-row-badges">
          <span>{draft.validationStatus}</span>
          {draft.duplicateStatus === 'PossibleDuplicate' && <span>Possible duplicate</span>}
        </div>
      </div>

      {draft.validationMessage && (
        <p className="row-validation-message" role="alert">{draft.validationMessage}</p>
      )}
      {draft.duplicateStatus === 'PossibleDuplicate' && (
        <div className="duplicate-warning">
          <p>
            This row exactly matches the date, amount, and description of an existing transaction.
          </p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={acknowledgeDuplicate}
              disabled={!editable}
              onChange={event => setAcknowledgeDuplicate(event.target.checked)}
            />
            <span>I reviewed the match and still want to approve this row.</span>
          </label>
        </div>
      )}

      <form onSubmit={(event) => void save(event)}>
        <div className="import-draft-fields">
          <label>
            <span>Date</span>
            <input type="date" value={transactionDate} disabled={!editable || isBusy}
              onChange={event => setTransactionDate(event.target.value)} />
          </label>
          <label>
            <span>Amount</span>
            <input type="number" step="0.0001" value={amount} disabled={!editable || isBusy}
              onChange={event => setAmount(event.target.value)} />
          </label>
          <label className="import-description-field">
            <span>Description</span>
            <input maxLength={500} value={description} disabled={!editable || isBusy}
              onChange={event => setDescription(event.target.value)} />
          </label>
          <label>
            <span>Category</span>
            <select value={categoryId} disabled={!editable || isBusy}
              onChange={event => {
                setCategoryId(event.target.value)
                setSubcategoryId('')
              }}>
              <option value="">Uncategorized</option>
              {categories
                .filter(category => category.isActive || category.id === savedCategorySelection.categoryId)
                .map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.isActive ? '' : ' (deactivated)'}
                  </option>
                ))}
            </select>
            {draft.importedCategoryName && <small>Imported: {draft.importedCategoryName}</small>}
          </label>
          <label>
            <span>Subcategory</span>
            <select value={subcategoryId} disabled={!editable || isBusy || !categoryId}
              onChange={event => setSubcategoryId(event.target.value)}>
              <option value="">None</option>
              {subcategories
                .filter(category => category.isActive || category.id === savedCategorySelection.subcategoryId)
                .map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.isActive ? '' : ' (deactivated)'}
                  </option>
                ))}
            </select>
            {draft.importedSubcategoryName && (
              <small>Imported: {draft.importedSubcategoryName}</small>
            )}
          </label>
        </div>
        {editable && (
          <div className="import-row-actions">
            <button className="secondary-button" type="submit" disabled={isBusy || !isDirty}>
              Save corrections
            </button>
            <button className="text-button" type="button" disabled={isBusy || !isDirty}
              onClick={resetChanges}>
              Refresh
            </button>
            <button className="primary-button" type="button" disabled={
              isBusy ||
              draft.validationStatus !== 'Valid' ||
              draft.duplicateStatus === 'NotChecked' ||
              (draft.duplicateStatus === 'PossibleDuplicate' && !acknowledgeDuplicate)
            } onClick={() => void decide('Approved')}>
              {isDirty ? 'Save and approve' : 'Approve'}
            </button>
            <button className="text-button" type="button" disabled={isBusy}
              onClick={() => void decide('Rejected')}>
              Reject
            </button>
            <button className="text-button" type="button" disabled={isBusy}
              onClick={() => void decide('Skipped')}>
              Skip
            </button>
          </div>
        )}
      </form>
    </article>
  )
}

export function ImportReviewPage() {
  const { currentHousehold } = useHouseholds()
  const [imports, setImports] = useState<ImportListItem[]>([])
  const [selectedImportId, setSelectedImportId] = useState(selectedImportFromUrl)
  const [detail, setDetail] = useState<ImportReviewDetail | null>(null)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [draftPage, setDraftPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const refreshList = async (householdId: string) => {
    const items = await getImports(householdId)
    setImports(items)
    setSelectedImportId(current => {
      if (items.some(item => item.id === current)) return current
      return items.find(item => item.status === 'ReadyForReview')?.id ?? items[0]?.id ?? ''
    })
  }

  const refreshDetail = async () => {
    if (!currentHousehold || !selectedImportId) return
    const updated = await getImport(currentHousehold.id, selectedImportId)
    setDetail(updated)
    await refreshList(currentHousehold.id)
  }

  useEffect(() => {
    if (!currentHousehold) return
    let isCurrent = true
    setIsLoading(true)
    setErrors([])
    void Promise.all([
      getImports(currentHousehold.id),
      getCategories(currentHousehold.id),
    ]).then(([importItems, categoryItems]) => {
      if (!isCurrent) return
      setImports(importItems)
      setCategories(categoryItems)
      setSelectedImportId(current =>
        importItems.some(item => item.id === current)
          ? current
          : importItems.find(item => item.status === 'ReadyForReview')?.id ?? importItems[0]?.id ?? '')
    }).catch(error => {
      if (isCurrent) setErrors(getErrorMessages(error))
    }).finally(() => {
      if (isCurrent) setIsLoading(false)
    })
    return () => { isCurrent = false }
  }, [currentHousehold])

  useEffect(() => {
    if (!currentHousehold || !selectedImportId) {
      setDetail(null)
      return
    }
    let isCurrent = true
    setIsLoading(true)
    setErrors([])
    void getImport(currentHousehold.id, selectedImportId)
      .then(result => { if (isCurrent) setDetail(result) })
      .catch(error => { if (isCurrent) setErrors(getErrorMessages(error)) })
      .finally(() => { if (isCurrent) setIsLoading(false) })
    return () => { isCurrent = false }
  }, [currentHousehold, selectedImportId])

  const pendingRows = useMemo(() => detail
    ? detail.totalRows - detail.approvedRows - detail.rejectedRows - detail.skippedRows
    : 0, [detail])
  const hasUncheckedDuplicates = detail?.drafts.some(
    draft => draft.duplicateStatus === 'NotChecked') ?? false
  const draftPageCount = detail
    ? Math.max(1, Math.ceil(detail.drafts.length / rowsPerPage))
    : 1
  const visibleDrafts = detail?.drafts.slice(
    (draftPage - 1) * rowsPerPage,
    draftPage * rowsPerPage,
  ) ?? []

  if (!currentHousehold) return null

  const handleDuplicates = async () => {
    if (!detail) return
    setErrors([])
    try {
      await checkImportDuplicates(currentHousehold.id, detail.id)
      await refreshDetail()
    } catch (error) {
      setErrors(getErrorMessages(error))
    }
  }

  const handleComplete = async () => {
    if (!detail) return
    setIsCompleting(true)
    setErrors([])
    try {
      await completeImport(currentHousehold.id, detail.id)
      await refreshDetail()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsCompleting(false)
    }
  }

  const handleDiscard = async () => {
    if (!detail || !window.confirm(
      `Discard ${detail.originalFileName} and all of its staged rows? This cannot be undone.`,
    )) return

    setIsDiscarding(true)
    setErrors([])
    try {
      await discardImport(currentHousehold.id, detail.id)
      setDetail(null)
      setDraftPage(1)
      window.history.replaceState(null, '', '/imports/review')
      await refreshList(currentHousehold.id)
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsDiscarding(false)
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

      <section className="management-content import-review-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Import staging</p>
            <h1>Review imported rows</h1>
            <p>Nothing becomes an official transaction until you review every row and complete the import.</p>
          </div>
          <AppLink to="/import">Upload another CSV</AppLink>
        </div>

        <ErrorSummary errors={errors} />

        {imports.length > 0 && (
          <label className="import-selector">
            <span>Import</span>
            <select value={selectedImportId} onChange={event => {
              const id = event.target.value
              setSelectedImportId(id)
              setDraftPage(1)
              window.history.replaceState(null, '', `/imports/review?importId=${id}`)
            }}>
              {imports.map(item => (
                <option key={item.id} value={item.id}>
                  {item.originalFileName} — {item.accountName} ({item.status})
                </option>
              ))}
            </select>
          </label>
        )}

        {isLoading && !detail ? (
          <p className="empty-state">Loading import...</p>
        ) : imports.length === 0 ? (
          <div className="empty-state">
            <h2>No imports yet</h2>
            <p>Upload a CSV to create staged rows for review.</p>
            <AppLink to="/import">Import a CSV</AppLink>
          </div>
        ) : detail && (
          <>
            <section className="import-review-summary">
              <div>
                <p className="eyebrow">{detail.status}</p>
                <h2>{detail.originalFileName}</h2>
                <p>{detail.accountName} · {detail.currency}</p>
              </div>
              <div className="import-stat-grid">
                <span><strong>{detail.totalRows}</strong>Total</span>
                <span><strong>{pendingRows}</strong>Pending</span>
                <span><strong>{detail.invalidRows}</strong>Invalid</span>
                <span><strong>{detail.duplicateRows}</strong>Possible duplicates</span>
                <span><strong>{detail.approvedRows}</strong>Approved</span>
                <span><strong>{detail.rejectedRows + detail.skippedRows}</strong>Not imported</span>
              </div>
              {hasUncheckedDuplicates && detail.canEdit && detail.status === 'ReadyForReview' && (
                <button className="secondary-button" type="button" onClick={() => void handleDuplicates()}>
                  Check for duplicates
                </button>
              )}
              {detail.canEdit && detail.status !== 'Completed' && (
                <button className="danger-button" type="button"
                  disabled={isDiscarding}
                  onClick={() => void handleDiscard()}>
                  {isDiscarding ? 'Discarding...' : 'Discard staged import'}
                </button>
              )}
              {detail.status === 'Completed' && (
                <p className="field-help">
                  Completed imports are retained to preserve the history of official transactions.
                </p>
              )}
            </section>

            <div className="import-draft-list">
              {visibleDrafts.map(draft => (
                <DraftRow
                  key={`${draft.id}-${draft.reviewDecision}-${draft.validationStatus}-${draft.duplicateStatus}`}
                  householdId={currentHousehold.id}
                  importFileId={detail.id}
                  draft={draft}
                  categories={categories}
                  canEdit={detail.canEdit}
                  isCompleted={detail.status === 'Completed'}
                  onChanged={refreshDetail}
                  onError={error => setErrors(getErrorMessages(error))}
                />
              ))}
            </div>

            {draftPageCount > 1 && (
              <nav className="import-pagination" aria-label="Import rows">
                <button className="secondary-button" type="button"
                  disabled={draftPage === 1}
                  onClick={() => setDraftPage(current => current - 1)}>
                  Previous rows
                </button>
                <span>Page {draftPage} of {draftPageCount}</span>
                <button className="secondary-button" type="button"
                  disabled={draftPage === draftPageCount}
                  onClick={() => setDraftPage(current => current + 1)}>
                  Next rows
                </button>
              </nav>
            )}

            <section className="complete-import-panel">
              {detail.status === 'Completed' ? (
                <>
                  <strong>Import completed</strong>
                  <p>Approved rows are now official transactions.</p>
                  <AppLink to="/transactions">View transactions</AppLink>
                </>
              ) : (
                <>
                  <strong>Complete import</strong>
                  <p>
                    {pendingRows === 0
                      ? `${detail.approvedRows} approved rows will become official transactions.`
                      : `Review ${pendingRows} remaining rows before completing this import.`}
                  </p>
                  <button className="primary-button" type="button"
                    disabled={!detail.canEdit || pendingRows !== 0 || isCompleting}
                    onClick={() => void handleComplete()}>
                    {isCompleting ? 'Completing...' : 'Create approved transactions'}
                  </button>
                </>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}
