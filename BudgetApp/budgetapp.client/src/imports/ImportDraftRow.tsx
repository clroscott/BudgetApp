import { memo, useEffect, useId, useLayoutEffect, useState, type FormEvent } from 'react'
import type { CategoryItem } from '../categories/categoryApi'
import { createCategorizationRule, type CategorizationRuleMatchOperator } from '../categorizationRules/categorizationRuleApi'
import { saveImportDraft, decideImportDraft, type ImportDraftItem, type ImportDraftMutationResult } from './importApi'
import type { PendingDraftUpdate } from './importBudgetInclusion'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'

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
  sourceWorksheetName?: string | null
  householdId: string
  importFileId: string
  draft: ImportDraftItem
  categories: CategoryItem[]
  pendingUpdate: PendingDraftUpdate | null
  canEdit: boolean
  isCompleted: boolean
  onChanged: () => Promise<boolean>
  onMutation: (result: ImportDraftMutationResult, holdRow?: boolean) => Promise<boolean>
  getVersion: () => string
  onRuleCreated: () => Promise<number | null>
  onFillRemaining: () => Promise<boolean>
  onDirtyChange: (draftId: string, update: PendingDraftUpdate | null) => void
  onRuleDirtyChange: (draftId: string, dirty: boolean) => void
  onRemove: (draftId: string, sourceRowNumber: number) => Promise<void>
  onError: (error: unknown) => void
  onBusyChange: (draftId: string, busy: boolean) => void
}

export const DraftRow = memo(function DraftRow({
  sourceWorksheetName,
  householdId,
  importFileId,
  draft,
  categories,
  pendingUpdate,
  canEdit,
  isCompleted,
  onChanged,
  onMutation,
  getVersion,
  onRuleCreated,
  onFillRemaining,
  onDirtyChange,
  onRuleDirtyChange,
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
  const isRuleDirty = isRuleEditorOpen && JSON.stringify([ruleMatchOperator, ruleMatchValue]) !== savedRuleSnapshot
  const confirmRuleDiscard = useUnsavedChangesGuard(
    isRuleDirty,
    'Discard your unsaved rule changes for this import row?',
  )
  useLayoutEffect(() => {
    onRuleDirtyChange(draft.id, isRuleDirty)
    return () => onRuleDirtyChange(draft.id, false)
  }, [draft.id, isRuleDirty, onRuleDirtyChange])
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
        await persistVisibleValues(true)
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

  const persistVisibleValues = async (holdRow = false) => {
    const parsedAmount = amount.trim() === '' ? null : Number(amount)
    if (parsedAmount !== null && !Number.isFinite(parsedAmount)) {
      throw new Error('Amount must be a number.')
    }

    const result = await saveImportDraft(householdId, importFileId, draft.id, {
      transactionDate: transactionDate || null,
      amount: parsedAmount,
      description: description.trim() || null,
      selectedCategoryId,
      includeInHouseholdBudget: includeHousehold, includeInPersonalBudget: includePersonal,
    }, getVersion())
    await onMutation(result, holdRow)
    return result
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsBusy(true)
    try {
      await persistVisibleValues()
      onDirtyChange(draft.id, null)
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
      // Persist first, but keep the row mounted through its decision. Use the
      // returned version/duplicate state, not the pre-correction snapshot.
      const corrected = decision === 'Approved' && isDirty ? await persistVisibleValues(true) : null
      const savedDraft = corrected?.items.find(item => item.id === draft.id) ?? draft
      if (corrected && savedDraft.duplicateStatus === 'PossibleDuplicate' && draft.duplicateStatus !== 'PossibleDuplicate') {
        await onMutation(corrected)
        onDirtyChange(draft.id, null)
        onError(new Error('Your correction was saved and now matches an existing transaction. Review the possible duplicate before approving it.'))
        return
      }
      const result = await decideImportDraft(
        householdId,
        importFileId,
        draft.id,
        decision,
        decision === 'Approved' && savedDraft.duplicateStatus === 'PossibleDuplicate'
          ? true
          : savedDraft.isDuplicateAcknowledged,
        getVersion(),
      )
      if (await onMutation(result)) {
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
      aria-label={`${sourceWorksheetName ? 'Excel' : 'CSV'} row ${draft.sourceRowNumber}`}>
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
          <p className="field-help">{sourceWorksheetName ? `Worksheet ${sourceWorksheetName} · Excel` : 'CSV'} row {draft.sourceRowNumber} · Validation: {draft.validationStatus}.</p>
          <p className="field-help">The full amount counts in each selected budget, with only one transaction.
            Household inclusion shares the expense, not your private account or uploaded file.</p>
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
})
