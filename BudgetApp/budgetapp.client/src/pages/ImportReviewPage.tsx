import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import {
  createCategorizationRule,
  type CategorizationRuleMatchOperator,
} from '../categorizationRules/categorizationRuleApi'
import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { TransactionsSectionNav } from '../components/TransactionsSectionNav'
import { ContextualHelp } from '../components/ContextualHelp'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { helpWarnings } from '../help/helpTopics'
import { useHouseholds } from '../households/useHouseholds'
import {
  applyImportCategorizationRules,
  bulkUpdateImportDrafts,
  bulkReviewImportDrafts,
  checkImportDuplicates,
  completeImport,
  discardImport,
  getImport,
  getImportCategorizationRulePreview,
  getImports,
  removeImportDraft,
  reviewImportDraft,
  updateImportDraft,
  type ImportDraftItem,
  type ImportDraftUpdate,
  type ImportListResult,
  type ImportListFilter,
  type ImportReviewDetail,
  type CategorizationRuleApplicationPreview,
} from '../imports/importApi'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { previewBulkBudgetInclusion, type BudgetInclusionPreset, type PendingDraftUpdate } from '../imports/importBudgetInclusion'

const rowsPerPage = 100

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

function importFilterFromUrl(): ImportListFilter {
  const filter = new URLSearchParams(window.location.search).get('filter')
  return filter === 'completed' || filter === 'all' || filter === 'ready' ? filter : 'inProgress'
}

function importPageFromUrl() {
  const page = Number(new URLSearchParams(window.location.search).get('page'))
  return Number.isSafeInteger(page) && page >= 1 && page <= 2_147_483_647 ? page : 1
}

function generatedRuleName(
  operator: CategorizationRuleMatchOperator,
  matchValue: string,
) {
  const operatorLabel = {
    Contains: 'Contains',
    StartsWith: 'Starts with',
    EndsWith: 'Ends with',
    Exact: 'Exactly matches',
  }[operator]
  return `${operatorLabel} ${matchValue.trim()}`.slice(0, 100)
}

interface DraftRowProps {
  householdId: string
  importFileId: string
  draft: ImportDraftItem
  categories: CategoryItem[]
  pendingUpdate: PendingDraftUpdate | null
  canEdit: boolean
  isCompleted: boolean
  onChanged: () => Promise<boolean>
  onRuleCreated: () => Promise<number | null>
  onFillRemaining: () => Promise<boolean>
  onDirtyChange: (draftId: string, update: PendingDraftUpdate | null) => void
  onRemove: (draftId: string, sourceRowNumber: number) => Promise<void>
  onError: (error: unknown) => void
  onBusyChange: (draftId: string, busy: boolean) => void
}

type DraftRowFilter =
  | 'all'
  | 'pending'
  | 'uncategorized'
  | 'parentOnly'
  | 'categorized'
  | 'possibleDuplicates'
  | 'invalid'
  | 'approved'
  | 'excluded'

type RuleApplicationMode = 'fill' | 'reapply'

function DraftRow({
  householdId,
  importFileId,
  draft,
  categories,
  pendingUpdate,
  canEdit,
  isCompleted,
  onChanged,
  onRuleCreated,
  onFillRemaining,
  onDirtyChange,
  onRemove,
  onError,
  onBusyChange,
}: DraftRowProps) {
  const savedCategorySelection = findCategorySelection(categories, draft.selectedCategoryId)
  const initialCategorySelection = findCategorySelection(
    categories,
    pendingUpdate ? pendingUpdate.selectedCategoryId : draft.selectedCategoryId,
  )
  const [transactionDate, setTransactionDate] = useState(
    pendingUpdate?.transactionDate ?? draft.transactionDate ?? '')
  const [amount, setAmount] = useState(
    pendingUpdate?.amount ?? draft.amount?.toString() ?? '')
  const [description, setDescription] = useState(
    pendingUpdate?.description ?? draft.description ?? '')
  const [categoryId, setCategoryId] = useState(initialCategorySelection.categoryId)
  const [subcategoryId, setSubcategoryId] = useState(initialCategorySelection.subcategoryId)
  const [includeHousehold, setIncludeHousehold] = useState(pendingUpdate?.includeInHouseholdBudget ?? draft.includeInHouseholdBudget ?? true)
  const [includePersonal, setIncludePersonal] = useState(pendingUpdate?.includeInPersonalBudget ?? draft.includeInPersonalBudget ?? false)
  const [isBusy, setIsBusy] = useState(false)
  const [areDetailsOpen, setAreDetailsOpen] = useState(false)
  const detailsId = useId()
  const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false)
  const [isCreatingRule, setIsCreatingRule] = useState(false)
  const [ruleCreated, setRuleCreated] = useState(false)
  const [ruleFillCount, setRuleFillCount] = useState(0)
  const [isFillingRuleMatches, setIsFillingRuleMatches] = useState(false)
  const [ruleMatchOperator, setRuleMatchOperator] =
    useState<CategorizationRuleMatchOperator>('Contains')
  const [ruleMatchValue, setRuleMatchValue] = useState('')
  const [savedRuleSnapshot, setSavedRuleSnapshot] = useState('')
  const confirmRuleDiscard = useUnsavedChangesGuard(
    isRuleEditorOpen && JSON.stringify([ruleMatchOperator, ruleMatchValue]) !== savedRuleSnapshot,
    'Discard your unsaved rule changes for this import row?',
  )
  const editable = canEdit && !isCompleted && !draft.approvedTransactionId
  const selectedCategoryId = subcategoryId || categoryId || null
  useEffect(() => {
    onBusyChange(draft.id, isBusy || isCreatingRule || isFillingRuleMatches)
    return () => onBusyChange(draft.id, false)
  }, [draft.id, isBusy, isCreatingRule, isFillingRuleMatches, onBusyChange])
  const subcategories = categories.find(category => category.id === categoryId)?.children ?? []
  const isDirty =
    transactionDate !== (draft.transactionDate ?? '') ||
    amount !== (draft.amount?.toString() ?? '') ||
    description !== (draft.description ?? '') ||
    selectedCategoryId !== draft.selectedCategoryId ||
    includeHousehold !== (draft.includeInHouseholdBudget ?? true) ||
    includePersonal !== (draft.includeInPersonalBudget ?? false)

  useEffect(() => {
    if (pendingUpdate) return

    const refreshedSelection = findCategorySelection(
      categories,
      draft.selectedCategoryId,
    )
    setTransactionDate(draft.transactionDate ?? '')
    setAmount(draft.amount?.toString() ?? '')
    setDescription(draft.description ?? '')
    setCategoryId(refreshedSelection.categoryId)
    setSubcategoryId(refreshedSelection.subcategoryId)
    setIncludeHousehold(draft.includeInHouseholdBudget ?? true)
    setIncludePersonal(draft.includeInPersonalBudget ?? false)
  }, [
    categories,
    draft.amount,
    draft.description,
    draft.selectedCategoryId,
    draft.transactionDate,
    draft.includeInHouseholdBudget, draft.includeInPersonalBudget,
    pendingUpdate,
  ])

  useEffect(() => {
    // Bulk choices update the parent cache. Sync only these controls so pending
    // date/amount/description/category edits and rule editors stay intact.
    setIncludeHousehold(pendingUpdate?.includeInHouseholdBudget ?? draft.includeInHouseholdBudget ?? true)
    setIncludePersonal(pendingUpdate?.includeInPersonalBudget ?? draft.includeInPersonalBudget ?? false)
  }, [pendingUpdate?.includeInHouseholdBudget, pendingUpdate?.includeInPersonalBudget,
    draft.includeInHouseholdBudget, draft.includeInPersonalBudget])

  useEffect(() => {
    onDirtyChange(draft.id, isDirty ? {
      transactionDate,
      amount,
      description,
      selectedCategoryId,
      includeInHouseholdBudget: includeHousehold, includeInPersonalBudget: includePersonal,
    } : null)
  }, [
    amount,
    description,
    draft.id,
    isDirty,
    onDirtyChange,
    selectedCategoryId,
    transactionDate, includeHousehold, includePersonal,
  ])

  const resetChanges = () => {
    if (isDirty && !window.confirm('Discard the unsaved corrections for this row?')) return
    const savedSelection = findCategorySelection(categories, draft.selectedCategoryId)
    setTransactionDate(draft.transactionDate ?? '')
    setAmount(draft.amount?.toString() ?? '')
    setDescription(draft.description ?? '')
    setCategoryId(savedSelection.categoryId)
    setSubcategoryId(savedSelection.subcategoryId)
    setIncludeHousehold(draft.includeInHouseholdBudget ?? true)
    setIncludePersonal(draft.includeInPersonalBudget ?? false)
  }

  const openRuleEditor = async () => {
    setIsBusy(true)
    try {
      if (isDirty) {
        await persistVisibleValues()
        // Keep this row mounted while its rule is being created. Refreshing here
        // would immediately remove it from uncategorized/parent-only filters.
      }

      const currentDescription = description.trim()
      setRuleMatchOperator('Contains')
      setRuleMatchValue(currentDescription)
      setSavedRuleSnapshot(JSON.stringify(['Contains', currentDescription]))
      setRuleCreated(false)
      setIsRuleEditorOpen(true)
    } catch (error) {
      onError(error)
    } finally {
      setIsBusy(false)
    }
  }

  const createFutureRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCategoryId) return

    setIsCreatingRule(true)
    try {
      await createCategorizationRule(householdId, {
        name: generatedRuleName(ruleMatchOperator, ruleMatchValue),
        matchField: 'Description',
        matchOperator: ruleMatchOperator,
        matchValue: ruleMatchValue,
        accountId: null,
        targetCategoryId: selectedCategoryId,
      })
      setRuleCreated(true)
      setIsRuleEditorOpen(false)
      const fillCount = await onRuleCreated()
      if (fillCount !== null) {
        onDirtyChange(draft.id, null)
        setRuleFillCount(fillCount)
      }
    } catch (error) {
      onError(error)
    } finally {
      setIsCreatingRule(false)
    }
  }

  const closeRuleEditor = async () => {
    if (!confirmRuleDiscard()) return
    setIsRuleEditorOpen(false)
    try {
      if (await onChanged()) onDirtyChange(draft.id, null)
    } catch (error) {
      onError(error)
    }
  }

  const fillRemainingRuleMatches = async () => {
    setIsFillingRuleMatches(true)
    try {
      if (await onFillRemaining()) setRuleFillCount(0)
    } catch (error) {
      onError(error)
    } finally {
      setIsFillingRuleMatches(false)
    }
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
      includeInHouseholdBudget: includeHousehold, includeInPersonalBudget: includePersonal,
    })
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsBusy(true)
    try {
      await persistVisibleValues()
      if (await onChanged()) onDirtyChange(draft.id, null)
      else onError(new Error('Your correction was saved, but could not be refreshed. Retry refreshing the selected import before making more changes.'))
    } catch (error) {
      onError(error)
    } finally {
      setIsBusy(false)
    }
  }

  const decide = async (
    decision: 'Approved' | 'Excluded' | 'Pending',
  ) => {
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
        decision === 'Approved' && draft.duplicateStatus === 'PossibleDuplicate'
          ? true
          : draft.isDuplicateAcknowledged,
      )
      if (await onChanged()) {
        if (decision === 'Approved') onDirtyChange(draft.id, null)
      } else onError(new Error('Your review decision was saved, but could not be refreshed. Retry refreshing the selected import before making more changes.'))
    } catch (error) {
      onError(error)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <article className={`import-draft-card import-decision-${draft.reviewDecision.toLowerCase()}`}
      aria-label={`CSV row ${draft.sourceRowNumber}`}>
      <form className="import-draft-form" onSubmit={(event) => void save(event)}>
        <div className="import-draft-line">
        <div className="import-draft-fields">
          <label>
            <span className="visually-hidden">Date</span>
            <input type="date" value={transactionDate} disabled={!editable || isBusy}
              onChange={event => setTransactionDate(event.target.value)} />
          </label>
          <label>
            <span className="visually-hidden">Amount</span>
            <input type="number" step="0.0001" value={amount} disabled={!editable || isBusy}
              onChange={event => setAmount(event.target.value)} />
          </label>
          <label className="import-description-field">
            <span className="visually-hidden">Description</span>
            <input maxLength={500} value={description} title={description} disabled={!editable || isBusy}
              onChange={event => setDescription(event.target.value)} />
          </label>
          <label>
            <span className="visually-hidden">Category</span>
            <select value={categoryId} disabled={!editable || isBusy}
              title={draft.importedCategoryName
                ? `Imported category: ${draft.importedCategoryName}`
                : undefined}
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
          </label>
          <label>
            <span className="visually-hidden">Subcategory</span>
            <select value={subcategoryId} disabled={!editable || isBusy || !categoryId}
              title={draft.importedSubcategoryName
                ? `Imported subcategory: ${draft.importedSubcategoryName}`
                : undefined}
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
          </label>
        </div>
        <fieldset className="budget-inclusion-controls import-budget-choices" disabled={!editable || isBusy}>
          <legend className="visually-hidden">Include in budgets</legend>
          <label className="checkbox-row"><input type="checkbox" checked={includePersonal}
            aria-label="My personal budget"
            disabled={draft.canChangePersonalInclusion === false}
            onChange={event => setIncludePersonal(event.target.checked)} />Personal</label>
          <label className="checkbox-row"><input type="checkbox" checked={includeHousehold}
            aria-label="Household budget"
            disabled={draft.canChangeHouseholdInclusion === false}
            onChange={event => setIncludeHousehold(event.target.checked)} />Household</label>
        </fieldset>
          <div className="import-row-badges" title={`Validation: ${draft.validationStatus}`}>
            <span>{draft.reviewDecision}</span>
            {draft.validationStatus !== 'Valid' && <span>{draft.validationStatus}</span>}
            {draft.duplicateStatus === 'PossibleDuplicate' && (
              <span className="possible-duplicate-badge">Possible duplicate transaction</span>
            )}
          </div>
          <div className="import-row-actions">
            {editable && <div className="import-row-decision-actions">
              {draft.reviewDecision === 'Pending' ? <>
                <button className="primary-button" type="button" disabled={
                  isBusy ||
                  draft.validationStatus !== 'Valid' ||
                  draft.duplicateStatus === 'NotChecked'
                } onClick={() => void decide('Approved')}>
                  {isDirty ? 'Save and approve' : 'Approve'}
                </button>
                <button className="text-button" type="button" disabled={isBusy}
                  onClick={() => void decide('Excluded')}>
                  Exclude
                </button>
              </> : (
                <button className="secondary-button" type="button" disabled={isBusy}
                  onClick={() => void decide('Pending')}>
                  Mark pending
                </button>
              )}
            </div>}
            <button className="secondary-button" type="button" aria-expanded={areDetailsOpen}
              aria-controls={detailsId} disabled={isBusy}
              onClick={() => setAreDetailsOpen(current => !current)}>Details</button>
          </div>
        </div>
        {draft.validationMessage && <p className="row-validation-message" role="alert">{draft.validationMessage}</p>}
        {areDetailsOpen && <div className="import-row-details" id={detailsId}>
          <p className="field-help">CSV row {draft.sourceRowNumber} · Validation: {draft.validationStatus}.</p>
          <p className="field-help">The full amount counts in each selected budget, with only one transaction.
            Household inclusion shares the expense, not your private account or CSV file.</p>
          {draft.canChangePersonalInclusion === false && <p className="field-help">Another reviewer has chosen their
            Personal budget for this row. You can add it to yours after the import is completed.</p>}
          {editable && <div className="import-row-detail-actions">
            {isDirty && <>
              <button className="secondary-button" type="submit" disabled={isBusy}>Save corrections</button>
              <button className="text-button" type="button" disabled={isBusy} onClick={resetChanges}>Refresh</button>
            </>}
            {selectedCategoryId && description.trim() && <button className="secondary-button" type="button"
              disabled={isBusy} title="Save this category choice and create a rule for future imports."
              onClick={() => void openRuleEditor()}>{isDirty ? 'Save & create rule' : 'Create rule'}</button>}
            <button className="danger-button" type="button" disabled={isBusy}
              onClick={() => void onRemove(draft.id, draft.sourceRowNumber)}>Remove</button>
          </div>}
        </div>}
      </form>
      {ruleCreated && (
        <div className="rule-created-message" role="status">
          <strong>Rule created.</strong>
          {ruleFillCount > 0 ? (
            <>
              <span>
                It can also fill {ruleFillCount} other uncategorized {
                  ruleFillCount === 1 ? 'row' : 'rows'
                } in this import. Fill them now?
              </span>
              <span className="rule-created-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isFillingRuleMatches}
                  onClick={() => void fillRemainingRuleMatches()}
                >
                  {isFillingRuleMatches
                    ? 'Filling categories...'
                    : `Fill remaining (${ruleFillCount})`}
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={isFillingRuleMatches}
                  onClick={() => setRuleFillCount(0)}
                >Not now</button>
              </span>
            </>
          ) : (
            <span>Future matching imports will use it.</span>
          )}
        </div>
      )}
      {isRuleEditorOpen && selectedCategoryId && (
        <form
          className="import-rule-editor"
          onSubmit={event => void createFutureRule(event)}
        >
          <div className="import-rule-editor-heading">
            <div>
              <strong>Create a rule for future imports</strong>
              <p>
                This rule will apply across accounts and will not change existing rows.
              </p>
            </div>
            <button
              className="text-button"
              type="button"
              disabled={isCreatingRule}
              onClick={() => void closeRuleEditor()}>
              Cancel
            </button>
          </div>
          <label>
            <span>When the description</span>
            <select
              value={ruleMatchOperator}
              disabled={isCreatingRule}
              onChange={event => setRuleMatchOperator(
                event.target.value as CategorizationRuleMatchOperator)}
            >
              <option value="Contains">contains</option>
              <option value="StartsWith">starts with</option>
              <option value="EndsWith">ends with</option>
              <option value="Exact">exactly matches</option>
            </select>
          </label>
          <label>
            <span>Match text</span>
            <input
              value={ruleMatchValue}
              maxLength={200}
              required
              disabled={isCreatingRule}
              onChange={event => setRuleMatchValue(event.target.value)}
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={isCreatingRule}>
            {isCreatingRule ? 'Creating...' : 'Create rule'}
          </button>
        </form>
      )}
    </article>
  )
}

export function ImportReviewPage() {
  const { currentHousehold } = useHouseholds()
  const { navigate, confirmNavigation } = useRouter()
  const [importList, setImportList] = useState<ImportListResult | null>(null)
  const [importPage, setImportPage] = useState(importPageFromUrl)
  const [selectedImportId, setSelectedImportId] = useState(selectedImportFromUrl)
  const [detail, setDetail] = useState<ImportReviewDetail | null>(null)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [importFilter, setImportFilter] = useState<ImportListFilter>(importFilterFromUrl)
  const [rowFilter, setRowFilter] = useState<DraftRowFilter>('all')
  const [draftPage, setDraftPage] = useState(1)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [applyingRuleMode, setApplyingRuleMode] =
    useState<RuleApplicationMode | null>(null)
  const [rulePreview, setRulePreview] =
    useState<CategorizationRuleApplicationPreview | null>(null)
  const [isLoadingRulePreview, setIsLoadingRulePreview] = useState(false)
  const [ruleApplicationMessage, setRuleApplicationMessage] = useState('')
  const [isSavingAll, setIsSavingAll] = useState(false)
  const [bulkSaveMessage, setBulkSaveMessage] = useState('')
  const [bulkBudgetPreset, setBulkBudgetPreset] = useState<BudgetInclusionPreset | ''>('')
  const [bulkBudgetScope, setBulkBudgetScope] = useState<'matching' | 'page'>('matching')
  const [bulkBudgetMessage, setBulkBudgetMessage] = useState('')
  const [bulkDecision, setBulkDecision] = useState<
    'Approved' | 'Excluded' | 'Pending' | null
  >(null)
  const [dirtyDraftUpdates, setDirtyDraftUpdates] =
    useState<Map<string, PendingDraftUpdate>>(new Map())
  const [busyDraftIds, setBusyDraftIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<string[]>([])
  useUnsavedChangesGuard(dirtyDraftUpdates.size > 0, 'Discard your unsaved staged import corrections?')

  const listLoad = usePageLoad(`${currentHousehold?.id}/${importFilter}/${importPage}`)
  const detailLoad = usePageLoad(`${currentHousehold?.id}/${selectedImportId}`)
  const categoryLoad = usePageLoad(`${currentHousehold?.id}/import-categories`)
  const householdId = currentHousehold?.id
  const { run: runList } = listLoad
  const { run: runDetail } = detailLoad
  const { run: runCategories } = categoryLoad
  const isLoading = categoryLoad.isPending || (Boolean(selectedImportId) && detailLoad.isPending)
  const filteredImports = listLoad.hasData ? importList?.items ?? [] : []
  const selectedNotListed = selectedImportId && !filteredImports.some(item => item.id === selectedImportId)
  const noMatchingFilesLabel = {
    inProgress: 'No unfinished files', ready: 'No files awaiting review',
    completed: 'No completed files', all: 'No uploaded files',
  }[importFilter]

  const handleDirtyChange = useCallback((
    draftId: string,
    update: PendingDraftUpdate | null,
  ) => {
    setDirtyDraftUpdates(current => {
      const updated = new Map(current)
      if (update) updated.set(draftId, update)
      else updated.delete(draftId)
      return updated
    })
  }, [])
  const handleBusyChange = useCallback((id: string, busy: boolean) => {
    setBusyDraftIds(current => {
      if (current.has(id) === busy) return current
      const updated = new Set(current)
      if (busy) updated.add(id)
      else updated.delete(id)
      return updated
    })
  }, [])

  const refreshList = useCallback(async (householdId: string) => {
    await runList(() => getImports(householdId, importFilter, importPage), result => {
      setImportList(result)
      setImportPage(result.page)
      setSelectedImportId(current => current || result.items[0]?.id || '')
    })
  }, [runList, importFilter, importPage])

  const refreshDetail = async () => {
    if (!currentHousehold || !selectedImportId) return false
    const refreshed = await runDetail(() => getImport(currentHousehold.id, selectedImportId), setDetail)
    await refreshList(currentHousehold.id)
    return refreshed
  }

  const handleRefreshSelected = async () => {
    if (!confirmNavigation()) return
    if (await refreshDetail()) {
      setDirtyDraftUpdates(new Map())
      setErrors([])
    }
  }

  const handleRuleCreated = async () => {
    if (!currentHousehold || !selectedImportId || !await refreshDetail()) return null
    const preview = await getImportCategorizationRulePreview(
      currentHousehold.id,
      selectedImportId,
    )
    setRulePreview(preview)
    return preview.fillChangedRows
  }

  const reloadCategories = useCallback(async () => {
    if (householdId) await runCategories(() => getCategories(householdId), setCategories)
  }, [householdId, runCategories])

  useEffect(() => { void reloadCategories() }, [reloadCategories])

  useEffect(() => {
    if (householdId) void refreshList(householdId)
  }, [householdId, refreshList])

  useEffect(() => {
    const query = new URLSearchParams()
    if (selectedImportId) query.set('importId', selectedImportId)
    if (importFilter !== 'inProgress') query.set('filter', importFilter)
    if (importPage > 1) query.set('page', String(importPage))
    navigate(`/imports/review${query.size ? `?${query}` : ''}`, { replace: true, bypassBlocker: true })
  }, [selectedImportId, importFilter, importPage, navigate])

  useEffect(() => {
    if (!householdId || !selectedImportId) {
      setDetail(null)
      return
    }
    setDetail(null)
    setDirtyDraftUpdates(new Map())
    setBulkSaveMessage('')
    setBulkBudgetPreset('')
    setBulkBudgetScope('matching')
    setBulkBudgetMessage('')
    setErrors([])
    void runDetail(() => getImport(householdId, selectedImportId), setDetail)
  }, [householdId, selectedImportId, runDetail])

  useEffect(() => {
    if (!currentHousehold || !detail?.canEdit ||
        detail.status !== 'ReadyForReview') {
      setRulePreview(null)
      setIsLoadingRulePreview(false)
      return
    }

    let isCurrent = true
    setRulePreview(null)
    setIsLoadingRulePreview(true)
    void getImportCategorizationRulePreview(
      currentHousehold.id,
      detail.id,
    ).then(preview => {
      if (isCurrent) setRulePreview(preview)
    }).catch(error => {
      if (isCurrent) setErrors(getErrorMessages(error))
    }).finally(() => {
      if (isCurrent) setIsLoadingRulePreview(false)
    })
    return () => { isCurrent = false }
  }, [currentHousehold, detail])

  const pendingRows = useMemo(() => detail
    ? detail.totalRows - detail.approvedRows - detail.excludedRows
    : 0, [detail])
  const pendingDrafts = detail?.drafts.filter(
    draft => draft.reviewDecision === 'Pending') ?? []
  const validPendingRows = pendingDrafts.filter(
    draft => draft.validationStatus === 'Valid').length
  const pendingPossibleDuplicates = pendingDrafts.filter(draft =>
    draft.validationStatus === 'Valid' &&
    draft.duplicateStatus === 'PossibleDuplicate').length
  const reviewedRows = detail
    ? detail.approvedRows + detail.excludedRows
    : 0
  const parentCategoryIds = useMemo(
    () => new Set(categories
      .filter(category => category.children.length > 0)
      .map(category => category.id)),
    [categories],
  )
  const fillRulePotentialCount = rulePreview?.fillChangedRows ?? 0
  const reapplyRulePotentialCount = rulePreview?.reapplyChangedRows ?? 0
  const hasUnsavedRows = dirtyDraftUpdates.size > 0
  const hasUncheckedDuplicates = detail?.drafts.some(
    draft => draft.duplicateStatus === 'NotChecked') ?? false
  const filteredDrafts = useMemo(() => {
    const drafts = detail?.drafts ?? []
    return drafts.filter(draft => {
      switch (rowFilter) {
        case 'pending':
          return draft.reviewDecision === 'Pending'
        case 'uncategorized':
          return !draft.selectedCategoryId
        case 'parentOnly':
          return Boolean(
            draft.selectedCategoryId &&
            parentCategoryIds.has(draft.selectedCategoryId),
          )
        case 'categorized':
          return Boolean(draft.selectedCategoryId)
        case 'possibleDuplicates':
          return draft.duplicateStatus === 'PossibleDuplicate'
        case 'invalid':
          return draft.validationStatus === 'Invalid'
        case 'approved':
          return draft.reviewDecision === 'Approved'
        case 'excluded':
          return draft.reviewDecision === 'Excluded'
        default:
          return true
      }
    })
  }, [detail, parentCategoryIds, rowFilter])
  const draftPageCount = Math.max(
    1,
    Math.ceil(filteredDrafts.length / rowsPerPage),
  )
  const visibleDrafts = filteredDrafts.slice(
    (draftPage - 1) * rowsPerPage,
    draftPage * rowsPerPage,
  )
  const bulkBudgetDrafts = bulkBudgetScope === 'page' ? visibleDrafts : filteredDrafts
  const bulkBudgetPreview = previewBulkBudgetInclusion(bulkBudgetDrafts, dirtyDraftUpdates, bulkBudgetPreset)
  const mutationBusy = isSavingAll || isCompleting || isDiscarding ||
    bulkDecision !== null || applyingRuleMode !== null || busyDraftIds.size > 0
  const bulkActionsBusy = isLoading || !categoryLoad.isFresh || (Boolean(selectedImportId) && !detailLoad.isFresh) || mutationBusy

  useEffect(() => {
    setDraftPage(current => Math.min(current, draftPageCount))
  }, [draftPageCount])

  if (!currentHousehold) return null

  const handleBulkBudgetInclusion = () => {
    if (!detail?.canEdit || detail.status !== 'ReadyForReview' || bulkActionsBusy ||
      bulkBudgetPreview.changes.size === 0) return
    const label = { Personal: 'My personal budget only', Household: 'Household budget only',
      PersonalAndHousehold: 'Personal + Household', Neither: 'Neither budget' }[bulkBudgetPreset as BudgetInclusionPreset]
    const count = bulkBudgetPreview.changes.size
    if (!window.confirm(`Set ${label} on ${count} staged ${count === 1 ? 'row' : 'rows'}? ` +
      'Existing corrections will be kept. Choices are not saved until you use Save all corrections.' +
      ((bulkBudgetPreset === 'Household' || bulkBudgetPreset === 'PersonalAndHousehold')
        ? ` ${helpWarnings.sharePersonalExpense} Sharing takes effect when approved transactions are created.` : ''))) return
    setDirtyDraftUpdates(current => {
      const updated = new Map(current)
      for (const [id, change] of bulkBudgetPreview.changes) {
        if (change) updated.set(id, change)
        else updated.delete(id)
      }
      return updated
    })
    setBulkBudgetMessage(`Budget choices applied to ${count} ${count === 1 ? 'row' : 'rows'}. Use Save all corrections to save any pending changes.`)
    setBulkSaveMessage('')
  }

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

  const handleApplyCategorizationRules = async (
    mode: RuleApplicationMode,
  ) => {
    if (!detail || hasUnsavedRows) return false
    if (mode === 'reapply' && !window.confirm(
      `Reapply rules to ${reapplyRulePotentialCount} matching staged ${
        reapplyRulePotentialCount === 1 ? 'row' : 'rows'
      } that would change? Existing categories will be replaced.`,
    )) return false

    setApplyingRuleMode(mode)
    setErrors([])
    setRuleApplicationMessage('')
    try {
      const result = await applyImportCategorizationRules(
        currentHousehold.id,
        detail.id,
        mode === 'reapply',
      )
      await refreshDetail()
      setRuleApplicationMessage(result.matchedRows === 0
        ? mode === 'fill'
          ? 'No uncategorized or parent-category rows matched an active rule.'
          : 'No staged rows matched an active rule.'
        : mode === 'fill'
          ? `${result.changedRows} ${
            result.changedRows === 1 ? 'row was' : 'rows were'
          } filled by rules.`
          : `${result.changedRows} ${
            result.changedRows === 1 ? 'row was' : 'rows were'
          } changed; ${result.unchangedRows} stayed the same.`)
      return true
    } catch (error) {
      setErrors(getErrorMessages(error))
      return false
    } finally {
      setApplyingRuleMode(null)
    }
  }

  const handleSaveAllCorrections = async () => {
    if (!detail || dirtyDraftUpdates.size === 0) return

    const updates: ImportDraftUpdate[] = []
    for (const [draftId, update] of dirtyDraftUpdates) {
      const parsedAmount = update.amount.trim() === ''
        ? null
        : Number(update.amount)
      if (parsedAmount !== null && !Number.isFinite(parsedAmount)) {
        const row = detail.drafts.find(draft => draft.id === draftId)
        setErrors([
          `CSV row ${row?.sourceRowNumber ?? ''} has an invalid amount.`.trim(),
        ])
        return
      }

      updates.push({
        draftId,
        transactionDate: update.transactionDate || null,
        amount: parsedAmount,
        description: update.description.trim() || null,
        selectedCategoryId: update.selectedCategoryId,
        includeInHouseholdBudget: update.includeInHouseholdBudget,
        includeInPersonalBudget: update.includeInPersonalBudget,
      })
    }

    setIsSavingAll(true)
    setErrors([])
    setBulkSaveMessage('')
    try {
      const result = await bulkUpdateImportDrafts(
        currentHousehold.id,
        detail.id,
        updates,
      )
      const refreshed = await refreshDetail()
      if (refreshed) setDirtyDraftUpdates(new Map())
      setBulkSaveMessage(
        `${result.savedRows} ${result.savedRows === 1 ? 'correction was' : 'corrections were'} saved.${refreshed ? '' : ' Retry refreshing the selected import before making more changes.'}`,
      )
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSavingAll(false)
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

  const handleBulkDecision = async (
    decision: 'Approved' | 'Excluded' | 'Pending',
  ) => {
    if (!detail || hasUnsavedRows) return

    const affectedRows = decision === 'Pending'
      ? reviewedRows
      : decision === 'Approved' ? validPendingRows : pendingRows
    const duplicateNote = decision === 'Approved' && pendingPossibleDuplicates > 0
      ? `, including ${pendingPossibleDuplicates} possible duplicate${
        pendingPossibleDuplicates === 1 ? '' : 's'}`
      : ''
    const confirmation = decision === 'Pending'
      ? `Reset ${affectedRows} reviewed row${affectedRows === 1 ? '' : 's'} to pending? Saved corrections and categories will be preserved.`
      : `${decision === 'Approved'
        ? 'Approve'
        : 'Exclude'} ${affectedRows} pending row${
        affectedRows === 1 ? '' : 's'}${duplicateNote}?`
    if (!window.confirm(confirmation)) return

    setBulkDecision(decision)
    setErrors([])
    try {
      await bulkReviewImportDrafts(
        currentHousehold.id,
        detail.id,
        decision,
      )
      await refreshDetail()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setBulkDecision(null)
    }
  }

  const handleRemoveDraft = async (draftId: string, sourceRowNumber: number) => {
    if (!detail || !window.confirm(
      `Remove CSV row ${sourceRowNumber} from this staged import? This cannot be undone.`,
    )) return

    setErrors([])
    try {
      await removeImportDraft(currentHousehold.id, detail.id, draftId)
      setDirtyDraftUpdates(current => {
        const updated = new Map(current)
        updated.delete(draftId)
        return updated
      })
      await refreshDetail()
    } catch (error) {
      setErrors(getErrorMessages(error))
    }
  }

  const handleDiscard = async () => {
    if (!detail || !window.confirm(
      helpWarnings.confirmDiscardImport(detail.originalFileName),
    )) return

    setIsDiscarding(true)
    setErrors([])
    try {
      await discardImport(currentHousehold.id, detail.id)
      setDetail(null)
      setDraftPage(1)
      setDirtyDraftUpdates(new Map())
      setSelectedImportId('')
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
        <BrandLockup />
        <AppLink className="header-link" to="/dashboard">Return to dashboard</AppLink>
      </header>

      <section className="management-content import-review-content">
        <TransactionsSectionNav />
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Import staging</p>
            <h1>Review imported rows</h1>
            <p>Nothing becomes an official transaction until you review every row and complete the import.</p>
          </div>
          <AppLink to="/import">Upload another CSV</AppLink>
        </div>

        <ContextualHelp topic="import-approval" />
        <p className="field-help">{helpWarnings.sharePersonalExpense}</p>
        <ErrorSummary errors={errors} />
        {!categoryLoad.isFresh && <PageLoadFeedback {...categoryLoad} subject="categories" onReload={() => void reloadCategories()} />}

        <section className="import-file-picker" aria-labelledby="import-file-heading">
          <div className="import-section-heading">
            <h2 id="import-file-heading">Choose an uploaded file</h2>
            {listLoad.isFresh && <button className="text-button" type="button"
              onClick={() => void refreshList(currentHousehold.id)}>Refresh import list</button>}
          </div>
          <p className="field-help">Find an upload here, then review the transactions inside it below.</p>
          {!listLoad.isFresh && <PageLoadFeedback {...listLoad} subject="import list"
            onReload={() => void refreshList(currentHousehold.id)} />}
          <div className="import-selector-row">
            <label className="import-selector">
              <span>File status</span>
              <select value={importFilter} disabled={mutationBusy} onChange={event => {
                const filter = event.target.value as ImportListFilter
                if (filter === importFilter || !confirmNavigation()) return
                // An intentional filter change opens a matching file. Ordinary
                // list refreshes and direct links still retain the selected file.
                setSelectedImportId('')
                setDetail(null)
                setDirtyDraftUpdates(new Map())
                setRowFilter('all')
                setDraftPage(1)
                setImportFilter(filter)
                setImportPage(1)
              }}>
                <option value="inProgress">Unfinished</option>
                <option value="ready">Awaiting review</option>
                <option value="completed">Completed</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="import-selector">
              <span>Uploaded file</span>
              <select value={selectedImportId} disabled={listLoad.isPending || mutationBusy}
                onChange={event => {
                  const id = event.target.value
                  if (id === selectedImportId || !confirmNavigation()) return
                  setSelectedImportId(id)
                  setDetail(null)
                  setDraftPage(1)
                }}>
                {selectedNotListed && <option value={selectedImportId}>
                  {detailLoad.hasData && detail ? `${detail.originalFileName} — ${detail.accountName} (${detail.status})` : 'Selected file'}
                </option>}
                {filteredImports.length === 0 && !selectedImportId && <option value="">
                  {listLoad.isPending ? 'Loading imports…' : listLoad.hasData ? noMatchingFilesLabel : 'Import list unavailable'}
                </option>}
                {filteredImports.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.originalFileName} — {item.accountName} ({item.status})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {importList && importList.totalPages > 1 && <nav className="import-pagination" aria-label="Import files">
            <button className="secondary-button" type="button" disabled={!listLoad.hasData || listLoad.isPending || importPage <= 1 || mutationBusy}
              onClick={() => { if (confirmNavigation()) setImportPage(current => current - 1) }}>Previous files</button>
            <span role="status">{listLoad.hasData
              ? `File page ${importList.page} of ${importList.totalPages} · ${importList.totalCount} matching files`
              : listLoad.isPending ? 'Loading file page…' : 'File page unavailable'}</span>
            <button className="secondary-button" type="button" disabled={!listLoad.hasData || listLoad.isPending || importPage >= importList.totalPages || mutationBusy}
              onClick={() => { if (confirmNavigation()) setImportPage(current => current + 1) }}>Next files</button>
          </nav>}
          {listLoad.hasData && importList && importList.totalPages <= 1 &&
            <p className="field-help" role="status">{importList.totalCount} matching uploaded {importList.totalCount === 1 ? 'file' : 'files'}</p>}
        </section>

        {selectedImportId && !detailLoad.isFresh && <PageLoadFeedback {...detailLoad} subject="selected import"
          disabled={mutationBusy} onReload={() => void handleRefreshSelected()} />}

        {!selectedImportId && listLoad.hasData && importList?.totalVisibleCount === 0 ? (
          <div className="empty-state">
            <h2>No imports yet</h2>
            <p>Upload a CSV to create staged rows for review.</p>
            <AppLink to="/import">Import a CSV</AppLink>
          </div>
        ) : !selectedImportId && listLoad.hasData && importList?.totalCount === 0 ? (
          <div className="empty-state">
            <h2>{noMatchingFilesLabel}</h2>
            <p>Choose another file status or upload a new CSV.</p>
          </div>
        ) : detailLoad.hasData && detail && (
          <>
            <section className="import-review-summary">
              <div className="import-section-heading">
                <div>
                  <p className="eyebrow">{detail.status}</p>
                  <h2>Review transactions in {detail.originalFileName}</h2>
                  <p>{detail.accountName} · {detail.currency}</p>
                </div>
                {detailLoad.isFresh && <button className="text-button" type="button"
                  disabled={mutationBusy} onClick={() => void handleRefreshSelected()}>Refresh selected import</button>}
              </div>
              <div className="import-stat-grid">
                <span><strong>{detail.totalRows}</strong>Total</span>
                <span><strong>{pendingRows}</strong>Pending</span>
                <span><strong>{detail.invalidRows}</strong>Invalid</span>
                <span><strong>{detail.duplicateRows}</strong>Possible duplicates</span>
                <span><strong>{detail.approvedRows}</strong>Approved</span>
                <span><strong>{detail.excludedRows}</strong>Excluded</span>
              </div>
              {detail.canEdit && detail.status === 'ReadyForReview' && (
                <div className="import-control-groups">
                  <div className="import-control-group">
                    <strong>1. Prepare rows</strong>
                    <div className="import-control-actions">
                      {hasUncheckedDuplicates && (
                        <button className="secondary-button" type="button"
                          disabled={bulkActionsBusy}
                          onClick={() => void handleDuplicates()}>
                          Check for duplicates
                        </button>
                      )}
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!hasUnsavedRows || bulkActionsBusy}
                        onClick={() => void handleSaveAllCorrections()}>
                        {isSavingAll
                          ? 'Saving corrections...'
                          : `Save all corrections (${dirtyDraftUpdates.size})`}
                      </button>
                      <button className="secondary-button" type="button"
                        disabled={
                          isLoadingRulePreview ||
                          !rulePreview ||
                          fillRulePotentialCount === 0 ||
                          hasUnsavedRows ||
                          bulkActionsBusy
                        }
                        onClick={() => void handleApplyCategorizationRules('fill')}>
                        {applyingRuleMode === 'fill'
                          ? 'Filling categories...'
                          : `Fill uncategorized (${
                            isLoadingRulePreview ? '...' : fillRulePotentialCount
                          })`}
                      </button>
                      <button className="secondary-button" type="button"
                        disabled={
                          isLoadingRulePreview ||
                          !rulePreview ||
                          reapplyRulePotentialCount === 0 ||
                          hasUnsavedRows ||
                          bulkActionsBusy
                        }
                        onClick={() => void handleApplyCategorizationRules('reapply')}>
                        {applyingRuleMode === 'reapply'
                          ? 'Reapplying rules...'
                          : `Reapply to all (${
                            isLoadingRulePreview ? '...' : reapplyRulePotentialCount
                          })`}
                      </button>
                    </div>
                    {hasUnsavedRows && (
                      <p className="field-help">
                        Save all corrections before approving or applying rules.
                      </p>
                    )}
                    {bulkSaveMessage && (
                      <p className="field-help" role="status">{bulkSaveMessage}</p>
                    )}
                    {!hasUnsavedRows && rulePreview && (
                      <p className="field-help">
                        Counts show matching rows that would actually change.
                        {rulePreview.reapplyUnchangedRows > 0 && ` ${
                          rulePreview.reapplyUnchangedRows
                        } matching ${
                          rulePreview.reapplyUnchangedRows === 1 ? 'row already has' : 'rows already have'
                        } the rule category.`}
                      </p>
                    )}
                    {ruleApplicationMessage && (
                      <p className="field-help" role="status">{ruleApplicationMessage}</p>
                    )}
                  </div>
                  <div className="import-control-group">
                    <strong>2. Review decisions</strong>
                    <div className="import-control-actions">
                      <button className="primary-button" type="button"
                        disabled={validPendingRows === 0 || hasUnsavedRows || bulkActionsBusy}
                        onClick={() => void handleBulkDecision('Approved')}>
                        {bulkDecision === 'Approved' ? 'Approving...' : 'Approve all valid'}
                      </button>
                      <button className="secondary-button" type="button"
                        disabled={pendingRows === 0 || hasUnsavedRows || bulkActionsBusy}
                        onClick={() => void handleBulkDecision('Excluded')}>
                        {bulkDecision === 'Excluded' ? 'Excluding...' : 'Exclude all'}
                      </button>
                    </div>
                    <div className="import-control-undo">
                      <button className="secondary-button" type="button"
                        disabled={reviewedRows === 0 || hasUnsavedRows || bulkActionsBusy}
                        onClick={() => void handleBulkDecision('Pending')}>
                        {bulkDecision === 'Pending'
                          ? 'Resetting decisions...'
                          : `Reset decisions to pending (${reviewedRows})`}
                      </button>
                      <span>Saved corrections and categories are preserved.</span>
                    </div>
                  </div>
                  <div className="import-control-group">
                    <strong>3. Finalize import</strong>
                    <div className="import-control-actions">
                      <button className="primary-button" type="button"
                        disabled={pendingRows !== 0 || bulkActionsBusy || hasUnsavedRows}
                        onClick={() => void handleComplete()}>
                        {isCompleting ? 'Creating...' : 'Create approved transactions'}
                      </button>
                    </div>
                  </div>
                  <div className="import-control-group import-control-danger">
                    <strong>Staged data</strong>
                    <p className="action-consequence">{helpWarnings.discardImport}</p>
                    <ContextualHelp topic="destructive-actions" />
                    <div className="import-control-actions">
                      <button className="danger-button" type="button"
                        disabled={bulkActionsBusy}
                        onClick={() => void handleDiscard()}>
                        {isDiscarding ? 'Discarding...' : 'Discard staged import'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {detail.status === 'Completed' && (
                <div>
                  <p className="field-help">
                    Completed imports are retained to preserve the history of official transactions.
                  </p>
                  <AppLink to="/transactions">View transactions</AppLink>
                </div>
              )}
              {detail.status !== 'ReadyForReview' && detail.status !== 'Completed' &&
                <p className="field-help">This import is {detail.status.toLowerCase()} and is not ready for review. Its rows cannot be approved or edited.</p>}
            </section>

            <div className="import-row-toolbar">
              <label>
                <span>Show transactions</span>
                <select value={rowFilter} onChange={event => {
                  if (!confirmNavigation()) return
                  setRowFilter(event.target.value as DraftRowFilter)
                  setDraftPage(1)
                }}>
                  <option value="all">All rows</option>
                  <option value="pending">Pending</option>
                  <option value="uncategorized">Uncategorized</option>
                  <option value="parentOnly">Parent category only</option>
                  <option value="categorized">Has category</option>
                  <option value="possibleDuplicates">Possible duplicates</option>
                  <option value="invalid">Invalid</option>
                  <option value="approved">Approved</option>
                  <option value="excluded">Excluded</option>
                </select>
              </label>
              <span>
                Showing <strong>{filteredDrafts.length}</strong> of {detail.totalRows} rows
              </span>
            </div>
            {detail.canEdit && detail.status === 'ReadyForReview' && <section
              className="import-bulk-budget-panel" aria-label="Bulk budget tools">
              <div className="import-bulk-budget-controls">
                <label><span>Bulk budget inclusion</span>
                  <select value={bulkBudgetPreset} disabled={bulkActionsBusy}
                    onChange={event => { setBulkBudgetPreset(event.target.value as BudgetInclusionPreset | ''); setBulkBudgetMessage('') }}>
                    <option value="">Choose budget inclusion…</option>
                    <option value="Personal">My personal budget only</option>
                    <option value="Household">Household budget only</option>
                    <option value="PersonalAndHousehold">Personal + Household</option>
                    <option value="Neither">Neither budget (keep the transaction)</option>
                  </select>
                </label>
                <label><span>Apply to</span>
                  <select value={bulkBudgetScope} disabled={bulkActionsBusy}
                    onChange={event => { setBulkBudgetScope(event.target.value as 'matching' | 'page'); setBulkBudgetMessage('') }}>
                    <option value="matching">All matching rows ({filteredDrafts.length}), across pages</option>
                    <option value="page">Current page ({visibleDrafts.length})</option>
                  </select>
                </label>
                <button className="secondary-button" type="button"
                  disabled={bulkActionsBusy || bulkBudgetPreview.changes.size === 0}
                  onClick={handleBulkBudgetInclusion}>Apply budget choices ({bulkBudgetPreview.changes.size})</button>
              </div>
              <p className="field-help">Keeps your existing corrections. Changes are staged, then saved with
                “Save all corrections”. Saving changed approved rows returns them to Pending for review.</p>
              {(bulkBudgetPreset === 'Household' || bulkBudgetPreset === 'PersonalAndHousehold') &&
                <p className="action-consequence">{helpWarnings.sharePersonalExpense}</p>}
              <ContextualHelp topic="scope-privacy" />
              {bulkBudgetPreset && <p className="field-help">{bulkBudgetPreview.changes.size} rows would change;
                {' '}{bulkBudgetPreview.unchanged} already match; {bulkBudgetPreview.skipped} excluded, linked,
                or permission-protected rows will be skipped.</p>}
              {bulkBudgetMessage && <p className="field-help" role="status">{bulkBudgetMessage}</p>}
            </section>}
            {filteredDrafts.length === 0 ? (
              <p className="empty-state">No rows match this filter.</p>
            ) : <>
              <p className="field-help" id="import-grid-help">Budget choices count the full amount in each selected budget.
                Use Details for row corrections, rules, removal, and sharing information. On smaller screens, scroll horizontally to see all columns.</p>
              <div className="import-review-grid" role="region" aria-label="Imported transactions"
                aria-describedby="import-grid-help" tabIndex={0}>
                <div className="import-draft-column-headings" aria-hidden="true">
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Description</span>
                  <span>Category</span>
                  <span>Subcategory</span>
                  <span>Budgets</span>
                  <span>Status</span>
                  <span>Review</span>
                </div>
              <div className="import-draft-list">
                {visibleDrafts.map(draft => (
                  <DraftRow
                    key={`${draft.id}-${draft.reviewDecision}-${draft.validationStatus}-${draft.duplicateStatus}`}
                    householdId={currentHousehold.id}
                    importFileId={detail.id}
                    draft={draft}
                    categories={categories}
                    pendingUpdate={dirtyDraftUpdates.get(draft.id) ?? null}
                    canEdit={detail.canEdit && detail.status === 'ReadyForReview' && !bulkActionsBusy}
                    isCompleted={detail.status === 'Completed'}
                    onChanged={refreshDetail}
                    onRuleCreated={handleRuleCreated}
                    onFillRemaining={() => handleApplyCategorizationRules('fill')}
                    onDirtyChange={handleDirtyChange}
                    onRemove={handleRemoveDraft}
                    onError={error => setErrors(getErrorMessages(error))}
                    onBusyChange={handleBusyChange}
                  />
                ))}
              </div>
              </div>
            </>}

            {draftPageCount > 1 && (
              <nav className="import-pagination" aria-label="Import rows">
                <button className="secondary-button" type="button"
                  disabled={draftPage === 1}
                  onClick={() => { if (confirmNavigation()) setDraftPage(current => current - 1) }}>
                  Previous rows
                </button>
                <span>Page {draftPage} of {draftPageCount}</span>
                <button className="secondary-button" type="button"
                  disabled={draftPage === draftPageCount}
                  onClick={() => { if (confirmNavigation()) setDraftPage(current => current + 1) }}>
                  Next rows
                </button>
              </nav>
            )}

          </>
        )}
      </section>
    </main>
  )
}
