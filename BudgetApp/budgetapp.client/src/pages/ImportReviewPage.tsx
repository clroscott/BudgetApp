import { ImportBatchControls } from '../imports/ImportBatchControls'
import { ImportReversalPreviewPanel } from '../imports/ImportReversalPreviewPanel'
import { useImportDraftCache, useImportReviewGuard } from '../imports/useImportDraftCache'
import { DraftRow } from '../imports/ImportDraftRow'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { ApiError } from '../api/apiClient'
import { useReadOwner } from '../api/useReadOwner'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import { PageFrame } from '../components/PageFrame'
import { ErrorSummary } from '../components/ErrorSummary'
import { TransactionsSectionNav } from '../components/TransactionsSectionNav'
import { ContextualHelp } from '../components/ContextualHelp'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { helpWarnings } from '../help/helpTopics'
import { useHouseholds } from '../households/useHouseholds'
import {
  applyImportCategorizationRules,
  saveImportDrafts,
  bulkReviewImportDrafts,
  checkImportDuplicates,
  completeImport,
  discardImport,
  getImportDraftPage,
  getBudgetChoicePreview,
  getImportCategorizationRulePreview,
  getImports,
  deleteImportDraft,
  type ImportDraftUpdate,
  type ImportListResult,
  type ImportListFilter,
  type ImportDraftMutationResult,
  type ImportBudgetChoicePreview,
  type ImportDraftFilter,
  type ImportDraftItem,
  type CategorizationRuleApplicationPreview,
  type ReverseImportResult,
} from '../imports/importApi'
import { reviewPageData, mergeDraftChanges, matchesDraftFilter, type ImportReviewPageData } from '../imports/importReviewState'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { countBulkBudgetInclusion, previewBulkBudgetInclusion, type BudgetInclusionPreset } from '../imports/importBudgetInclusion'
import { importReviewLocation, readImportReviewLocation, type ImportReviewSelection } from '../imports/importReviewLocation'

type DraftRowFilter = ImportDraftFilter

type RuleApplicationMode = 'fill' | 'reapply'

const emptyDrafts: ImportDraftItem[] = []

export function ImportReviewPage() {
  const { currentHousehold } = useHouseholds()
  const { search, navigate, confirmNavigation } = useRouter()
  const selection = useMemo(() => readImportReviewLocation(search), [search])
  const { importId: selectedImportId, page: importPage, filter: importFilter } = selection
  const selectionRef = useRef(selection)
  useLayoutEffect(() => { selectionRef.current = selection }, [selection])
  const changeSelection = useCallback((update: (current: ImportReviewSelection) => ImportReviewSelection, replace = false) => {
    const next = update(selectionRef.current)
    if (navigate(importReviewLocation(next), { replace, bypassBlocker: true })) selectionRef.current = next
  }, [navigate])
  const setSelectedImportId = (importId: string) => changeSelection(current => ({ ...current, importId }))
  const setImportPage = (update: (current: number) => number) => changeSelection(current => ({ ...current, page: update(current.page) }))
  const [importList, setImportList] = useState<ImportListResult | null>(null)
  const [detail, setDetail] = useState<ImportReviewPageData | null>(null)
  const versionRef = useRef('')
  const getVersion = useCallback(() => versionRef.current, [])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [rowFilter, setRowFilter] = useState<DraftRowFilter>('all')
  const [draftPage, setDraftPage] = useState(1)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isReversing, setIsReversing] = useState(false)
  useUnsavedChangesGuard(isReversing, 'Import undo is still running. Leaving will not cancel it. Leave and check its saved status later?')
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [applyingRuleMode, setApplyingRuleMode] =
    useState<RuleApplicationMode | null>(null)
  const [rulePreview, setRulePreview] =
    useState<CategorizationRuleApplicationPreview | null>(null)
  const [ruleApplicationMessage, setRuleApplicationMessage] = useState('')
  const [isSavingAll, setIsSavingAll] = useState(false)
  const [isRefreshingSelected, setIsRefreshingSelected] = useState(false)
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)
  const [isRemovingDraft, setIsRemovingDraft] = useState(false)
  const [bulkSaveMessage, setBulkSaveMessage] = useState('')
  const [completionMessage, setCompletionMessage] = useState('')
  const [bulkBudgetPreset, setBulkBudgetPreset] = useState<BudgetInclusionPreset | ''>('')
  const [bulkBudgetScope, setBulkBudgetScope] = useState<'matching' | 'page'>('matching')
  const [bulkBudgetMessage, setBulkBudgetMessage] = useState('')
  const [matchingBudgetPreview, setMatchingBudgetPreview] = useState<ImportBudgetChoicePreview | null>(null)
  const budgetPreviewCache = useRef<{ key: string; data: ImportBudgetChoicePreview; consideredIds: Set<string> } | null>(null)
  const [bulkDecision, setBulkDecision] = useState<
    'Approved' | 'Excluded' | 'Pending' | null
  >(null)
  const { dirtyDraftUpdates, budgetFlags, editedDraftIdsKey, updateDraft,
    updateDrafts, clearDrafts } = useImportDraftCache()
  const [busyDraftIds, setBusyDraftIds] = useState<Set<string>>(new Set())
  const dirtyRuleDraftIds = useRef(new Set<string>())
  const [errors, setErrors] = useState<string[]>([])
  const [writeNeedsReload, setWriteNeedsReload] = useState(false)
  useUnsavedChangesGuard(dirtyDraftUpdates.size > 0,
    'Discard your unsaved staged import corrections?')

  const listLoad = usePageLoad(`${currentHousehold?.id}/${importFilter}/${importPage}`)
  const detailLoad = usePageLoad(`${currentHousehold?.id}/${selectedImportId}/${rowFilter}/${draftPage}`)
  const selectedOwner = useReadOwner(`${currentHousehold?.id}/${selectedImportId}`)
  const categoryLoad = usePageLoad(`${currentHousehold?.id}/import-categories`)
  const rulePreviewLoad = usePageLoad(`${currentHousehold?.id}/${selectedImportId}/rule-preview`)
  const budgetPreviewLoad = usePageLoad(`${currentHousehold?.id}/${selectedImportId}/${rowFilter}/${bulkBudgetPreset}/${detail?.updatedAtUtc}/${editedDraftIdsKey}`)
  const householdId = currentHousehold?.id
  const { run: runList } = listLoad
  const { run: runDetail } = detailLoad
  const { run: runCategories } = categoryLoad
  const { run: runPreview, markReady: markPreviewReady } = rulePreviewLoad
  const { run: runBudgetPreview } = budgetPreviewLoad
  const isLoadingRulePreview = rulePreviewLoad.isPending
  const isSelectedContextCurrent = useImportReviewGuard(`${householdId}/${selectedImportId}`)
  const isLoading = isRefreshingSelected || categoryLoad.isPending || (Boolean(selectedImportId) && detailLoad.isPending)
  const filteredImports = listLoad.hasData ? importList?.items ?? [] : []
  const selectedNotListed = selectedImportId && !filteredImports.some(item => item.id === selectedImportId)
  const noMatchingFilesLabel = {
    inProgress: 'No unfinished files', ready: 'No files awaiting review',
    completed: 'No completed files', all: 'No uploaded files',
  }[importFilter]

  const handleDirtyChange = useCallback((id: string, update: Parameters<typeof updateDraft>[1]) => {
    if (isSelectedContextCurrent()) updateDraft(id, update)
  }, [isSelectedContextCurrent, updateDraft])

  const parentCategoryIds = useMemo(
    () => new Set(categories
      .filter(category => category.children.length > 0)
      .map(category => category.id)),
    [categories],
  )
  const handleRuleDirtyChange = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyRuleDraftIds.current.add(id)
    else dirtyRuleDraftIds.current.delete(id)
  }, [])
  const confirmRowNavigation = () => dirtyRuleDraftIds.current.size === 0 || window.confirm(
    'Discard your unsaved categorization-rule changes before changing rows? Transaction corrections will be kept.',
  )
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
    await runList(signal => getImports(householdId, importFilter, importPage, signal), result => {
      setImportList(result)
      // Server normalization/automatic selection replaces the current entry.
      // It must not add a second Back step for one deliberate file choice.
      changeSelection(current => ({ ...current, page: result.page, importId: current.importId || result.items[0]?.id || '' }), true)
    })
  }, [runList, importFilter, importPage, changeSelection])

  const reloadRulePreview = useCallback(async () => {
    if (!householdId || !selectedImportId) return null
    let count: number | null = null
    await runPreview(signal => getImportCategorizationRulePreview(householdId, selectedImportId, signal), preview => {
      setRulePreview(preview)
      count = preview.fillChangedRows
    })
    return count
  }, [householdId, selectedImportId, runPreview])

  const applyPage = useCallback((result: Awaited<ReturnType<typeof getImportDraftPage>>) => {
    versionRef.current = result.summary.updatedAtUtc
    setDetail({ ...reviewPageData(result), loadedHouseholdId: householdId })
    setDraftPage(result.page)
  }, [householdId])

  const refreshDetail = useCallback(async (reloadList = true) => {
    if (!currentHousehold || !selectedImportId) return false
    const stillSelected = selectedOwner.captureContext()
    const refreshed = await runDetail(signal => getImportDraftPage(currentHousehold.id, selectedImportId, rowFilter, draftPage, signal), applyPage)
    if (!stillSelected()) return false
    if (reloadList) await refreshList(currentHousehold.id)
    return refreshed && stillSelected()
  }, [currentHousehold, selectedImportId, selectedOwner, runDetail, rowFilter, draftPage, applyPage, refreshList])

  const refreshRows = useCallback(async () => {
    if (!householdId || !selectedImportId) return false
    return runDetail(signal => getImportDraftPage(householdId, selectedImportId, rowFilter, draftPage, signal), applyPage)
  }, [householdId, selectedImportId, rowFilter, draftPage, runDetail, applyPage])

  const handleMutation = useCallback(async (result: ImportDraftMutationResult, holdRow = false) => {
    if (!isSelectedContextCurrent()) return false
    versionRef.current = result.summary.updatedAtUtc
    const previousRows = new Map(detail?.drafts.map(item => [item.id, item]) ?? [])
    const membershipChanged = result.removedDraftIds.length > 0 || result.items.some(item => {
      const previous = previousRows.get(item.id)
      return !previous || matchesDraftFilter(previous, rowFilter, parentCategoryIds) !== matchesDraftFilter(item, rowFilter, parentCategoryIds)
    })
    setDetail(current => {
      if (!current) return current
      const merged = mergeDraftChanges(current, result)
      // A rule editor / save-and-approve sequence must not disappear mid-action.
      if (holdRow) merged.drafts = current.drafts
      if (rowFilter === 'all') merged.totalCount = result.summary.counts.totalRows
      return merged
    })
    setImportList(current => current ? { ...current, items: current.items.map(item => item.id === result.summary.id
      ? { ...item, ...result.summary.counts, status: result.summary.status } : item) } : current)
    // Pending <-> Approved does not change the rule matching set. Exclusion,
    // removal, description and category changes do; no file-list reload is needed.
    if (result.removedDraftIds.length > 0 || result.items.some(item => {
      const previous = previousRows.get(item.id)
      return !previous || previous.description !== item.description || previous.selectedCategoryId !== item.selectedCategoryId ||
        (previous.reviewDecision === 'Excluded') !== (item.reviewDecision === 'Excluded')
    })) void reloadRulePreview()
    if (!holdRow && membershipChanged) return refreshRows()
    return result.items.length > 0 || result.removedDraftIds.length > 0
  }, [isSelectedContextCurrent, detail, rowFilter, parentCategoryIds, reloadRulePreview, refreshRows])

  const handleRefreshSelected = async () => {
    if (isRefreshingSelected || !confirmNavigation()) return
    setIsRefreshingSelected(true)
    try {
      if (await refreshDetail()) {
        clearDrafts()
        setErrors([])
        setWriteNeedsReload(false)
        setCompletionMessage('')
      }
    } finally { if (isSelectedContextCurrent()) setIsRefreshingSelected(false) }
  }

  const handleRuleCreated = useCallback(async () => {
    if (!isSelectedContextCurrent() || !await refreshDetail(false)) return null
    return reloadRulePreview()
  }, [isSelectedContextCurrent, refreshDetail, reloadRulePreview])

  const reloadCategories = useCallback(async () => {
    if (householdId) await runCategories(signal => getCategories(householdId, signal), setCategories)
  }, [householdId, runCategories])

  useEffect(() => { void reloadCategories() }, [reloadCategories])

  useEffect(() => {
    if (householdId) void refreshList(householdId)
  }, [householdId, refreshList])

  useEffect(() => {
    setCompletionMessage('')
    if (!householdId || !selectedImportId) {
      setDetail(null)
      return
    }
    setDetail(null)
    clearDrafts()
    setBulkSaveMessage('')
    setBulkBudgetPreset('')
    setBulkBudgetScope('matching')
    setBulkBudgetMessage('')
    budgetPreviewCache.current = null
    setErrors([])
    setWriteNeedsReload(false)
    setIsCompleting(false)
    setIsReversing(false)
    setIsDiscarding(false)
    setIsSavingAll(false)
    setIsRefreshingSelected(false)
    setIsCheckingDuplicates(false)
    setIsRemovingDraft(false)
    setApplyingRuleMode(null)
    setBulkDecision(null)
    setRuleApplicationMessage('')
    setBusyDraftIds(new Set())
    versionRef.current = ''
    setRowFilter('all')
    setDraftPage(1)
  }, [householdId, selectedImportId, clearDrafts])

  useEffect(() => {
    if (!householdId || !selectedImportId) return
    void runDetail(signal => getImportDraftPage(householdId, selectedImportId, rowFilter, draftPage, signal), result => {
      versionRef.current = result.summary.updatedAtUtc
      setDetail({ ...reviewPageData(result), loadedHouseholdId: householdId })
      setDraftPage(result.page)
    })
  }, [householdId, selectedImportId, rowFilter, draftPage, runDetail])

  useEffect(() => {
    if (!householdId || !detail?.canEdit ||
        detail.status !== 'ReadyForReview') {
      setRulePreview(null)
      markPreviewReady()
      return
    }

    setRulePreview(null)
    void reloadRulePreview()
  }, [householdId, detail?.id, detail?.canEdit, detail?.status, markPreviewReady, reloadRulePreview])

  const pendingRows = useMemo(() => detail
    ? detail.totalRows - detail.approvedRows - detail.excludedRows
    : 0, [detail])
  const validPendingRows = detail?.counts.validPendingRows ?? 0
  const reviewedRows = detail
    ? detail.approvedRows + detail.excludedRows
    : 0
  const fillRulePotentialCount = rulePreview?.fillChangedRows ?? 0
  const reapplyRulePotentialCount = rulePreview?.reapplyChangedRows ?? 0
  const hasUnsavedRows = dirtyDraftUpdates.size > 0
  const hasUncheckedDuplicates = (detail?.counts.uncheckedDuplicateRows ?? 0) > 0
  const draftPageCount = Math.max(1, detail?.totalPages ?? 1)
  const visibleDrafts = detailLoad.hasData ? detail?.drafts ?? emptyDrafts : emptyDrafts
  const matchingRowCount = detail?.totalCount ?? 0
  const bulkBudgetDrafts = bulkBudgetScope === 'page' ? visibleDrafts : matchingBudgetPreview?.items ?? emptyDrafts
  const bulkBudgetPreview = useMemo(() => {
    const counts = countBulkBudgetInclusion(bulkBudgetDrafts, budgetFlags, bulkBudgetPreset)
    if (bulkBudgetScope === 'matching' && matchingBudgetPreview) {
      counts.skipped += matchingBudgetPreview.skipped
      counts.unchanged += matchingBudgetPreview.unchanged
    }
    return counts
  }, [bulkBudgetDrafts, budgetFlags, bulkBudgetPreset, bulkBudgetScope, matchingBudgetPreview])
  const mutationBusy = isReversing || isSavingAll || isCompleting || isDiscarding || isCheckingDuplicates || isRemovingDraft ||
    bulkDecision !== null || applyingRuleMode !== null || busyDraftIds.size > 0
  const bulkActionsBusy = isLoading || writeNeedsReload || !categoryLoad.isFresh || (Boolean(selectedImportId) && !detailLoad.isFresh) || mutationBusy

  const handleWriteError = useCallback((error: unknown) => {
    if (!isSelectedContextCurrent()) return
    setErrors(getErrorMessages(error))
    if (error instanceof ApiError && (error.status === 0 || error.status === 409 || error.status >= 500)) setWriteNeedsReload(true)
  }, [isSelectedContextCurrent])

  const reloadBudgetPreview = useCallback(async () => {
    if (!householdId || !selectedImportId || !bulkBudgetPreset || !detail?.updatedAtUtc ||
      !detail.canEdit || detail.status !== 'ReadyForReview') return
    const key = `${householdId}/${selectedImportId}/${rowFilter}/${bulkBudgetPreset}/${detail.updatedAtUtc}`
    const editedIds = editedDraftIdsKey ? editedDraftIdsKey.split(',') : []
    const cached = budgetPreviewCache.current
    // Staging a preview's choices changes local flags, not their saved baseline.
    // Don't download those same off-page baselines again. A new edited ID, saved
    // version, filter, preset, household or import still requires a fresh read.
    const canReuse = cached?.key === key && editedIds.every(id => cached.consideredIds.has(id))
    await runBudgetPreview(() => canReuse ? Promise.resolve(cached.data) : getBudgetChoicePreview(householdId, selectedImportId, rowFilter,
      bulkBudgetPreset === 'Personal' || bulkBudgetPreset === 'PersonalAndHousehold',
      bulkBudgetPreset === 'Household' || bulkBudgetPreset === 'PersonalAndHousehold', editedIds, detail.updatedAtUtc), result => {
        budgetPreviewCache.current = { key, data: result, consideredIds: new Set([...editedIds, ...result.items.map(item => item.id)]) }
        setMatchingBudgetPreview(result)
      })
  }, [householdId, selectedImportId, rowFilter, bulkBudgetPreset, editedDraftIdsKey, detail, runBudgetPreview])
  useEffect(() => {
    if (bulkBudgetScope === 'matching' && detailLoad.isFresh && !mutationBusy) void reloadBudgetPreview()
  }, [bulkBudgetScope, detailLoad.isFresh, mutationBusy, reloadBudgetPreview])

  const handleBulkBudgetInclusion = () => {
    if (!detail?.canEdit || detail.status !== 'ReadyForReview' || bulkActionsBusy ||
      (bulkBudgetScope === 'matching' && !budgetPreviewLoad.isFresh) ||
      bulkBudgetPreview.changed === 0) return
    const label = { Personal: 'My personal budget only', Household: 'Household budget only',
      PersonalAndHousehold: 'Personal + Household', Neither: 'Neither budget' }[bulkBudgetPreset as BudgetInclusionPreset]
    const count = bulkBudgetPreview.changed
    if (!window.confirm(`Set ${label} on ${count} staged ${count === 1 ? 'row' : 'rows'}? ` +
      'Existing corrections will be kept. Choices are not saved until you use Save all corrections.' +
      ((bulkBudgetPreset === 'Household' || bulkBudgetPreset === 'PersonalAndHousehold')
        ? ` ${helpWarnings.sharePersonalExpense} Sharing takes effect when approved transactions are created.` : ''))) return
    updateDrafts(previewBulkBudgetInclusion(bulkBudgetDrafts, dirtyDraftUpdates, bulkBudgetPreset).changes)
    setBulkBudgetMessage(`Budget choices applied to ${count} ${count === 1 ? 'row' : 'rows'}. Use Save all corrections to save any pending changes.`)
    setBulkSaveMessage('')
  }

  const handleDuplicates = async () => {
    if (!currentHousehold || !detail) return
    setIsCheckingDuplicates(true)
    setErrors([])
    try {
      await checkImportDuplicates(currentHousehold.id, detail.id)
      if (!isSelectedContextCurrent()) return
      await refreshDetail(false)
    } catch (error) {
      handleWriteError(error)
    } finally { if (isSelectedContextCurrent()) setIsCheckingDuplicates(false) }
  }

  const handleApplyCategorizationRules = useCallback(async (
    mode: RuleApplicationMode,
  ) => {
    if (!currentHousehold || !detail || hasUnsavedRows || !rulePreviewLoad.isFresh) return false
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
      if (!isSelectedContextCurrent()) return false
      await refreshDetail(false)
      await reloadRulePreview()
      if (!isSelectedContextCurrent()) return false
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
      handleWriteError(error)
      return false
    } finally {
      if (isSelectedContextCurrent()) setApplyingRuleMode(null)
    }
  }, [detail, hasUnsavedRows, rulePreviewLoad.isFresh, reapplyRulePotentialCount, currentHousehold,
    isSelectedContextCurrent, refreshDetail, reloadRulePreview, handleWriteError])
  const fillRemainingRuleMatches = useCallback(() => handleApplyCategorizationRules('fill'), [handleApplyCategorizationRules])

  const handleSaveAllCorrections = async () => {
    if (!currentHousehold || !detail || dirtyDraftUpdates.size === 0) return

    const updates: ImportDraftUpdate[] = []
    for (const [draftId, update] of dirtyDraftUpdates) {
      const parsedAmount = update.amount.trim() === ''
        ? null
        : Number(update.amount)
      if (parsedAmount !== null && !Number.isFinite(parsedAmount)) {
        const row = detail.drafts.find(draft => draft.id === draftId)
        setErrors([
          `${detail?.sourceWorksheetName ? 'Excel' : 'CSV'} row ${row?.sourceRowNumber ?? ''} has an invalid amount.`.trim(),
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
      const result = await saveImportDrafts(
        currentHousehold.id,
        detail.id,
        updates,
        versionRef.current,
      )
      if (!isSelectedContextCurrent()) return
      await handleMutation(result, true)
      // A bulk command can add/remove matches outside the visible page.
      const refreshed = await refreshRows()
      if (!isSelectedContextCurrent()) return
      if (refreshed) clearDrafts()
      setBulkSaveMessage(
        `${result.savedRows} ${result.savedRows === 1 ? 'correction was' : 'corrections were'} saved.${refreshed ? '' : ' Retry refreshing the selected import before making more changes.'}`,
      )
    } catch (error) {
      handleWriteError(error)
    } finally {
      if (isSelectedContextCurrent()) setIsSavingAll(false)
    }
  }

  const handleComplete = async () => {
    if (!currentHousehold || !detail) return
    setIsCompleting(true)
    setErrors([])
    setCompletionMessage('')
    try {
      await completeImport(currentHousehold.id, detail.id)
      if (!isSelectedContextCurrent()) return
      const refreshed = await refreshDetail()
      if (isSelectedContextCurrent()) setCompletionMessage('Import completed. Approved transactions were created.' +
        (refreshed ? '' : ' Retry refreshing the selected import to see the updated result; do not create the transactions again.'))
    } catch (error) {
      handleWriteError(error)
    } finally {
      if (isSelectedContextCurrent()) setIsCompleting(false)
    }
  }

  const handleBulkDecision = async (
    decision: 'Approved' | 'Excluded' | 'Pending',
  ) => {
    if (!currentHousehold || !detail || hasUnsavedRows) return

    const affectedRows = decision === 'Pending'
      ? reviewedRows
      : decision === 'Approved' ? validPendingRows : pendingRows
    const duplicateNote = decision === 'Approved' && (detail.duplicateRows > 0)
      ? ', including any possible duplicates among these rows'
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
      if (!isSelectedContextCurrent()) return
      await refreshDetail(false)
      if (decision !== 'Approved') await reloadRulePreview()
    } catch (error) {
      handleWriteError(error)
    } finally {
      if (isSelectedContextCurrent()) setBulkDecision(null)
    }
  }

  const handleRemoveDraft = useCallback(async (draftId: string, sourceRowNumber: number) => {
    if (!currentHousehold || !detail || isRemovingDraft || !window.confirm(
      `Remove ${detail?.sourceWorksheetName ? 'Excel' : 'CSV'} row ${sourceRowNumber} from this staged import? This cannot be undone.`,
    )) return

    setIsRemovingDraft(true)
    setErrors([])
    try {
      const result = await deleteImportDraft(currentHousehold.id, detail.id, draftId, versionRef.current)
      if (!isSelectedContextCurrent()) return
      handleDirtyChange(draftId, null)
      await handleMutation(result)
    } catch (error) {
      handleWriteError(error)
    } finally { if (isSelectedContextCurrent()) setIsRemovingDraft(false) }
  }, [detail, isRemovingDraft, currentHousehold, isSelectedContextCurrent, handleDirtyChange, handleMutation, handleWriteError])

  const handleDiscard = async () => {
    if (!currentHousehold || !detail || !window.confirm(
      helpWarnings.confirmDiscardImport(detail.originalFileName),
    )) return

    setIsDiscarding(true)
    setErrors([])
    try {
      await discardImport(currentHousehold.id, detail.id)
      if (!isSelectedContextCurrent()) return
      setDetail(null)
      setDraftPage(1)
      clearDrafts()
      changeSelection(current => ({ ...current, importId: '' }), true)
      await refreshList(currentHousehold.id)
    } catch (error) {
      handleWriteError(error)
    } finally {
      if (isSelectedContextCurrent()) setIsDiscarding(false)
    }
  }

  const handleReversed = useCallback((result: ReverseImportResult) => {
    if (!isSelectedContextCurrent()) return
    versionRef.current = result.updatedAtUtc
    setDetail(current => current ? { ...current, status: result.status, updatedAtUtc: result.updatedAtUtc } : current)
    setImportList(current => current ? { ...current, items: current.items.map(item => item.id === result.importFileId
      ? { ...item, status: result.status } : item) } : current)
    setIsReversing(false)
    setCompletionMessage(`Import undone. ${result.reversedTransactionCount} transactions were voided; original history was retained.`)
  }, [isSelectedContextCurrent])

  if (!currentHousehold) return null

  return (
    <PageFrame contentClassName="import-review-content">
        <TransactionsSectionNav />
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Import staging</p>
            <h1>Review imported rows</h1>
            <p>Nothing becomes an official transaction until you review every row and complete the import.</p>
          </div>
          <AppLink to="/import">Upload another file</AppLink>
        </div>

        <ContextualHelp topic="import-approval" />
        <p className="field-help">{helpWarnings.sharePersonalExpense}</p>
        <ErrorSummary errors={errors} revealOnChange />
        {writeNeedsReload && <div role="alert">
          <p>The save result is uncertain or this import changed elsewhere. Your corrections are kept. Reload before trying another save.</p>
          <button type="button" className="secondary-button" disabled={isLoading || mutationBusy}
            onClick={() => { void refreshRows().then(loaded => { if (loaded && isSelectedContextCurrent()) setWriteNeedsReload(false) }) }}>
            Reload rows without discarding corrections
          </button>
        </div>}
        {completionMessage && <p role="status">{completionMessage}</p>}
        {!categoryLoad.isFresh && <PageLoadFeedback {...categoryLoad} subject="categories" onReload={() => void reloadCategories()} />}
        {detailLoad.hasData && detail?.canEdit && detail.status === 'ReadyForReview' && !rulePreviewLoad.isFresh &&
          <PageLoadFeedback {...rulePreviewLoad} subject="categorization rule matches" disabled={mutationBusy}
            onReload={() => void reloadRulePreview()} />}

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
                changeSelection(() => ({ importId: '', filter, page: 1 }))
                setDetail(null)
                clearDrafts()
                setRowFilter('all')
                setDraftPage(1)
              }}>
                <option value="inProgress">Unfinished</option>
                <option value="ready">Awaiting review</option>
                <option value="completed">Completed / undone</option>
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
                  {detailLoad.hasData && detail ? `${detail.originalFileName}${detail.sourceWorksheetName ? ` · ${detail.sourceWorksheetName}` : ''} — ${detail.accountName} (${detail.status})` : 'Selected file'}
                </option>}
                {filteredImports.length === 0 && !selectedImportId && <option value="">
                  {listLoad.isPending ? 'Loading imports…' : listLoad.isFresh ? noMatchingFilesLabel : 'Import list unavailable'}
                </option>}
                {filteredImports.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.originalFileName}{item.sourceWorksheetName ? ` · ${item.sourceWorksheetName}` : ''} — {item.accountName} ({item.status})
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
          {listLoad.isFresh && importList && importList.totalPages <= 1 &&
            <p className="field-help" role="status">{importList.totalCount} matching uploaded {importList.totalCount === 1 ? 'file' : 'files'}</p>}
        </section>

        {selectedImportId && !detailLoad.isFresh && <PageLoadFeedback {...detailLoad} subject="selected import"
          disabled={mutationBusy} onReload={() => void handleRefreshSelected()} />}

        {!selectedImportId && listLoad.isFresh && importList?.totalVisibleCount === 0 ? (
          <div className="empty-state">
            <h2>No imports yet</h2>
            <p>Upload a CSV or Excel workbook to create staged rows for review.</p>
            <AppLink to="/import">Import transactions</AppLink>
          </div>
        ) : !selectedImportId && listLoad.isFresh && importList?.totalCount === 0 ? (
          <div className="empty-state">
            <h2>{noMatchingFilesLabel}</h2>
            <p>Choose another file status or upload a new file.</p>
          </div>
        ) : (detailLoad.hasData || detailLoad.isPending && detail?.id === selectedImportId &&
          detail.loadedHouseholdId === householdId) && detail && (
          <>
            <section className="import-review-summary">
              <div className="import-section-heading">
                <div>
                  <p className="eyebrow">{detail.status}</p>
                  <h2>Review transactions in {detail.originalFileName}</h2>
                  {detail.sourceWorksheetName && <p>Worksheet: <strong>{detail.sourceWorksheetName}</strong>. Row numbers refer to the original Excel worksheet.</p>}
                  <p>{detail.accountName} · {detail.currency}</p>
                </div>
                {detailLoad.isFresh && <button className="text-button" type="button"
                  disabled={mutationBusy || isRefreshingSelected} onClick={() => void handleRefreshSelected()}>Refresh selected import</button>}
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
                <ImportBatchControls dirtyCount={dirtyDraftUpdates.size} pendingRows={pendingRows}
                  validPendingRows={validPendingRows} reviewedRows={reviewedRows} hasUncheckedDuplicates={hasUncheckedDuplicates}
                  bulkActionsBusy={bulkActionsBusy} isSavingAll={isSavingAll} isCompleting={isCompleting} isDiscarding={isDiscarding}
                  applyingRuleMode={applyingRuleMode} bulkDecision={bulkDecision} rulePreview={rulePreview}
                  rulePreviewFresh={rulePreviewLoad.isFresh} isLoadingRulePreview={isLoadingRulePreview}
                  fillRulePotentialCount={fillRulePotentialCount} reapplyRulePotentialCount={reapplyRulePotentialCount}
                  bulkSaveMessage={bulkSaveMessage} ruleApplicationMessage={ruleApplicationMessage}
                  onCheckDuplicates={handleDuplicates} onSaveAll={handleSaveAllCorrections}
                  onApplyRules={handleApplyCategorizationRules} onDecision={handleBulkDecision}
                  onComplete={handleComplete} onDiscard={handleDiscard} />
              )}
              {detail.status === 'Completed' && (
                <div>
                  <p className="field-help">
                    Completed imports are retained to preserve the history of official transactions.
                  </p>
                  <AppLink to="/transactions">View transactions</AppLink>
                  {householdId && detailLoad.isFresh && detail.canEdit && <ImportReversalPreviewPanel
                    key={`${householdId}/${detail.id}/${detail.updatedAtUtc}`} householdId={householdId} importId={detail.id}
                    onBusyChange={setIsReversing} onReversed={handleReversed} />}
                </div>
              )}
              {detail.status === 'Reversed' && <p role="status">This import was undone. Its transactions are voided and excluded from active totals. Original rows and audit history are retained. Upload a corrected file as a new import if needed.</p>}
              {detail.status !== 'ReadyForReview' && detail.status !== 'Completed' && detail.status !== 'Reversed' &&
                <p className="field-help">This import is {detail.status.toLowerCase()} and is not ready for review. Its rows cannot be approved or edited.</p>}
            </section>

            <div className="import-row-toolbar">
              <label>
                <span>Show transactions</span>
                <select value={rowFilter} disabled={mutationBusy} onChange={event => {
                  if (event.target.value === rowFilter || !confirmRowNavigation()) return
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
                {detailLoad.isFresh ? <>Showing <strong>{matchingRowCount}</strong> of {detail.totalRows} rows</>
                  : 'Refreshing matching rows; the previous count is not current.'}
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
                    <option value="matching">All matching rows ({detailLoad.isFresh ? matchingRowCount : 'loading…'}), across pages</option>
                    <option value="page">Current page ({visibleDrafts.length})</option>
                  </select>
                </label>
                <button className="secondary-button" type="button"
                  disabled={bulkActionsBusy || (bulkBudgetScope === 'matching' && !budgetPreviewLoad.isFresh) || bulkBudgetPreview.changed === 0}
                  onClick={handleBulkBudgetInclusion}>Apply budget choices ({bulkBudgetPreview.changed})</button>
              </div>
              <p className="field-help">Keeps your existing corrections. Changes are staged, then saved with
                “Save all corrections”. Saving changed approved rows returns them to Pending for review.</p>
              {(bulkBudgetPreset === 'Household' || bulkBudgetPreset === 'PersonalAndHousehold') &&
                <p className="action-consequence">{helpWarnings.sharePersonalExpense}</p>}
              <ContextualHelp topic="scope-privacy" />
              {bulkBudgetPreset && bulkBudgetScope === 'matching' && !budgetPreviewLoad.isFresh &&
                <PageLoadFeedback {...budgetPreviewLoad} subject="matching budget choices" onReload={() => void reloadBudgetPreview()} />}
              {bulkBudgetPreset && (bulkBudgetScope === 'page' || budgetPreviewLoad.isFresh) && <p className="field-help">{bulkBudgetPreview.changed} rows would change;
                {' '}{bulkBudgetPreview.unchanged} already match; {bulkBudgetPreview.skipped} excluded, linked,
                or permission-protected rows will be skipped.</p>}
              {bulkBudgetMessage && <p className="field-help" role="status">{bulkBudgetMessage}</p>}
            </section>}
            {detailLoad.isFresh && matchingRowCount === 0 ? (
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
                    sourceWorksheetName={detail.sourceWorksheetName}
                    key={draft.id}
                    householdId={currentHousehold.id}
                    importFileId={detail.id}
                    draft={draft}
                    categories={categories}
                    pendingUpdate={dirtyDraftUpdates.get(draft.id) ?? null}
                    canEdit={detail.canEdit && detail.status === 'ReadyForReview' && !bulkActionsBusy}
                    isCompleted={detail.status === 'Completed' || detail.status === 'Reversed'}
                    onChanged={refreshRows}
                    onMutation={handleMutation}
                    getVersion={getVersion}
                    onRuleCreated={handleRuleCreated}
                    onFillRemaining={fillRemainingRuleMatches}
                    onDirtyChange={handleDirtyChange}
                    onRuleDirtyChange={handleRuleDirtyChange}
                    onRemove={handleRemoveDraft}
                    onError={handleWriteError}
                    onBusyChange={handleBusyChange}
                  />
                ))}
              </div>
              </div>
            </>}

            {draftPageCount > 1 && (
              <nav className="import-pagination" aria-label="Import rows">
                <button className="secondary-button" type="button"
                  disabled={draftPage === 1 || bulkActionsBusy}
                  onClick={() => { if (confirmRowNavigation()) setDraftPage(current => current - 1) }}>
                  Previous rows
                </button>
                <span>{detailLoad.isFresh ? `Page ${draftPage} of ${draftPageCount}` : 'Refreshing row page…'}</span>
                <button className="secondary-button" type="button"
                  disabled={draftPage === draftPageCount || bulkActionsBusy}
                  onClick={() => { if (confirmRowNavigation()) setDraftPage(current => current + 1) }}>
                  Next rows
                </button>
              </nav>
            )}

          </>
        )}
    </PageFrame>
  )
}
