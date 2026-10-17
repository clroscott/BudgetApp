import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useReadOwner } from '../api/useReadOwner'
import { getCategories, type CategoryItem, type CategoryType } from '../categories/categoryApi'
import { PageFrame } from '../components/PageFrame'
import { budgetInclusionLabel } from '../transactions/budgetInclusion'
import { BudgetInclusionEditor, type BudgetInclusionEditState } from '../components/BudgetInclusionEditor'
import { useRouter } from '../routing/useRouter'
import { ErrorSummary } from '../components/ErrorSummary'
import { TransactionsSectionNav } from '../components/TransactionsSectionNav'
import { useHouseholds } from '../households/useHouseholds'
import { ContextualHelp } from '../components/ContextualHelp'
import { SavedTransactionFilters } from '../components/SavedTransactionFilters'
import { buildTransactionQuery, createDefaultFilters, createInitialFilters, filterIntentKey,
  resolveFilterCategory, uncategorizedFilterValue, type DateFilterMode, type TransactionFilters } from '../transactions/transactionFilters'
import { readTransactionLocation, transactionFilterLocation } from '../transactions/transactionLocation'
import { buildTransactionParameters } from '../transactions/transactionQuery'
import { AppLink } from '../routing/AppLink'
import { useReadTutorialPage } from '../tutorials/readTutorialState'
import { useTransactionTutorialPage, transactionTutorialKey } from '../tutorials/transactionTutorialState'
import { TutorialContext } from '../tutorials/tutorialContext'
import { ApiError } from '../api/apiClient'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { annualReportReturnLink, transactionFilterKey } from '../transactions/reportContext'
import {
  downloadTransactionsCsv,
  getTransactions,
  updateTransaction,
  type TransactionItem,
  type TransactionQuery,
  type UpdateTransactionRequest,
} from '../transactions/transactionApi'

interface PaginationState {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
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
    updatedAtUtc: transaction.updatedAtUtc,
  }
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
}

export function TransactionManagementPage() {
  const { search, navigate, confirmNavigation } = useRouter()
  const { currentHousehold } = useHouseholds()
  const location = useMemo(() => readTransactionLocation(search), [search])
  const { reportContext } = location
  const contextKey = `${currentHousehold?.id}/${currentHousehold?.role}/${search}`
  const { captureContext } = useReadOwner(contextKey)
  const tutorials = useContext(TutorialContext)
  const transactionGuideActive = [transactionTutorialKey, 'categorize-transactions'].includes(tutorials?.activeTutorial?.key ?? '')
  const [guideSelection, setGuideSelection] = useState<string | null>(() => tutorials?.transactionGuide?.selection ?? tutorials?.categorizationGuide?.selection ?? null)
  const [inclusionStates, setInclusionStates] = useState<Record<string, BudgetInclusionEditState>>({})
  const observeInclusion = useCallback((id: string, state: BudgetInclusionEditState | null) => setInclusionStates(current => {
    if (JSON.stringify(current[id] ?? null) === JSON.stringify(state)) return current
    const next = { ...current }; if (state) next[id] = state; else delete next[id]; return next
  }), [])
  const [outcomes, setOutcomes] = useState<{ revision: number; records: Record<string, { revision: number; kind: 'saved' | 'reloaded' }> }>({ revision: 0, records: {} })
  const recordOutcome = useCallback((id: string, kind: 'saved' | 'reloaded') => setOutcomes(current => ({ revision: current.revision + 1,
    records: { ...current.records, [id]: { revision: current.revision + 1, kind } } })), [])
  const [uncertainId, setUncertainId] = useState<string | null>(null)
  const reconcileRead = useRef<{ id: string; context: string } | null>(null)
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [totalsByCurrency, setTotalsByCurrency] = useState<Record<string, number>>({})
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [filters, setFilters] = useState<TransactionFilters>(location.filters)
  const appliedFilters = useMemo(() => resolveFilterCategory(location.filters, categories), [location, categories])
  const [presetNeedsCorrection, setPresetNeedsCorrection] = useState(false)
  const appliedQuery = useMemo<TransactionQuery>(() => location.query ?? { page: 1 }, [location])
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 100,
    totalCount: 0,
    totalPages: 0,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRequest, setEditRequest] = useState<UpdateTransactionRequest | null>(null)
  const [editBaseline, setEditBaseline] = useState<UpdateTransactionRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [totalsUnavailable, setTotalsUnavailable] = useState(false)
  const [reloadGeneration, setReloadGeneration] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [loadedContext, setLoadedContext] = useState<string | null>(null)
  const rowContext = `${contextKey}/${reloadGeneration}`
  const lookupContext = `${currentHousehold?.id}/${currentHousehold?.role}`
  const [loadedLookups, setLoadedLookups] = useState<string | null>(null)
  const [lookupErrors, setLookupErrors] = useState<string[]>([])
  const [lookupGeneration, setLookupGeneration] = useState(0)

  useEffect(() => {
    // Only accepted URL changes reach this effect. Typing a draft filter never
    // changes the URL, and a canceled traversal never discards the row editor.
    setFilters(location.filters)
    setPresetNeedsCorrection(false)
    setEditingId(null)
    setEditRequest(null)
    setEditBaseline(null)
    setIsSaving(false)
    setIsExporting(false)
  }, [location])
  useEffect(() => { setFilters(current => resolveFilterCategory(current, categories)) }, [location, categories])

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
      setLoadedLookups(lookupContext)
      setLookupErrors([])
      setFilters(current => resolveFilterCategory(current, categoryItems))
    }).catch(error => {
      if (isCurrent) { setLoadedLookups(null); setLookupErrors(getErrorMessages(error)) }
    })
    return () => { isCurrent = false }
  }, [currentHousehold, lookupContext, lookupGeneration])

  useEffect(() => {
    if (!currentHousehold) return
    if (location.error) {
      setIsLoading(false)
      setLoadFailed(true)
      setErrors([location.error])
      return
    }
    let isCurrent = true
    setIsLoading(true)
    setLoadFailed(false)
    setErrors([])
    void getTransactions(currentHousehold.id, appliedQuery)
      .then(result => {
        if (!isCurrent) return
        setTransactions(result.items)
        setLoadedContext(rowContext)
        if (reconcileRead.current?.context === contextKey) {
          recordOutcome(reconcileRead.current.id, 'reloaded'); reconcileRead.current = null; setUncertainId(null)
        }
        setTotalsByCurrency(result.totalsByCurrency)
        setTotalsUnavailable(false)
        setPagination({
          page: result.page,
          pageSize: result.pageSize,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
        })
      })
      .catch(error => {
        if (isCurrent) {
          setErrors(getErrorMessages(error))
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [appliedQuery, currentHousehold, reloadGeneration, location.error, rowContext, contextKey, recordOutcome])

  const isEditDirty = editRequest !== null && editBaseline !== null &&
    JSON.stringify(editRequest) !== JSON.stringify(editBaseline)
  const confirmDiscard = useUnsavedChangesGuard(
    isEditDirty,
    'Discard the unsaved transaction changes?',
  )
  const filterCategories = categories.filter(category =>
    !filters.categoryType || category.type === filters.categoryType)
  const filterSubcategories = categories.find(category =>
    category.id === filters.categoryId)?.children ?? []
  const editCategorySelection = findCategorySelection(categories, editRequest?.categoryId ?? null)
  const editSubcategories = categories.find(category =>
    category.id === editCategorySelection.categoryId)?.children ?? []
  const matchesReport = reportContext !== null &&
    reportContext.householdId === currentHousehold?.id &&
    transactionFilterKey(appliedQuery) === transactionFilterKey(reportContext.query)
  let pendingFilterChanges = false
  try {
    pendingFilterChanges = filterIntentKey(filters) !== filterIntentKey(appliedFilters)
    buildTransactionQuery(filters, 1)
  } catch {
    pendingFilterChanges = true
  }
  const activeCategory = appliedQuery.uncategorizedOnly ? 'Uncategorized only'
    : appliedQuery.categoryId
      ? findCategorySelection(categories, appliedQuery.categoryId).categoryId
        ? categoryLabel(categories, appliedQuery.categoryId)
        : 'Selected category (unavailable)'
      : 'All categories'
  const fresh = loadedContext === rowContext && loadedLookups === lookupContext && !isLoading && !loadFailed && !totalsUnavailable && !location.error
  const selectedRecord = transactions.find(row => row.id === guideSelection)
  const selectedOutcome = guideSelection ? outcomes.records[guideSelection] : undefined
  const pendingInclusion = Object.values(inclusionStates)
  const uncertainInclusion = Object.entries(inclusionStates).find(([, state]) => state.uncertain)?.[0]
  useTransactionTutorialPage({ householdId: currentHousehold?.id ?? '', url: `/transactions${search}`, fresh,
    busy: isSaving || isExporting || pendingInclusion.some(state => state.busy), dirty: isEditDirty || pendingInclusion.some(state => state.dirty),
    uncertain: uncertainId !== null || Boolean(uncertainInclusion), pendingFilters: pendingFilterChanges,
    selection: guideSelection, visible: Boolean(selectedRecord), canEdit: selectedRecord?.canEdit ?? false, editingId,
    outcomeRevision: selectedOutcome?.revision ?? 0, outcomeKind: selectedOutcome?.kind ?? null,
    attentionTarget: uncertainId ? 'transaction-task-recovery' : uncertainInclusion ? 'transaction-task-inclusion-attention' : undefined })
  const readTutorial = useReadTutorialPage(fresh && !isExporting && !isEditDirty && !pendingFilterChanges,
    isExporting ? 'Preparing your requested download…' : pendingFilterChanges ? 'Apply your filter changes before continuing.'
      : isEditDirty ? 'Exit the guide and finish your unsaved transaction edit first.' : undefined)

  if (!currentHousehold) return null

  const cancelEditing = () => {
    setEditingId(null)
    setEditRequest(null)
    setEditBaseline(null)
  }

  const confirmDiscardEdit = () => {
    if (!confirmDiscard()) return false
    cancelEditing()
    return true
  }

  const startEditing = (transaction: TransactionItem) => {
    if (editingId === transaction.id) return
    if (!confirmDiscardEdit()) return
    setEditingId(transaction.id)
    setEditRequest(toEditRequest(transaction))
    setEditBaseline(toEditRequest(transaction))
    setErrors([])
  }

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const query = buildTransactionQuery(filters, 1)
      if (presetNeedsCorrection && (
        (filters.accountId && !accounts.some(account => account.id === filters.accountId)) ||
        (filters.categoryId && filters.categoryId !== uncategorizedFilterValue &&
          !filterCategories.some(category => category.id === filters.categoryId)) ||
        (filters.subcategoryId && !filterSubcategories.some(category => category.id === filters.subcategoryId)))) {
        throw new Error('Correct the unavailable preset choices before applying filters. You can explicitly select all accounts, categories, or subcategories.')
      }
      if (!confirmNavigation()) return
      cancelEditing()
      setErrors([])
      setPresetNeedsCorrection(false)
      navigate(transactionFilterLocation(filters, 1, reportContext, query), { bypassBlocker: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
    }
  }

  const handleResetFilters = () => {
    if (!confirmNavigation()) return
    cancelEditing()
    const defaults = createDefaultFilters()
    setFilters(defaults)
    setPresetNeedsCorrection(false)
    navigate(transactionFilterLocation(defaults, 1, reportContext), { bypassBlocker: true })
    setErrors([])
  }

  const changePage = (page: number) => {
    if (!confirmNavigation()) return
    cancelEditing()
    navigate(transactionFilterLocation(appliedFilters, page, reportContext, { ...appliedQuery, page }), { bypassBlocker: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const restoreReportFilters = () => {
    if (!reportContext || !confirmNavigation()) return
    cancelEditing()
    const restored = resolveFilterCategory(createInitialFilters(buildTransactionParameters(reportContext.query).toString()), categories)
    setFilters(restored)
    setPresetNeedsCorrection(false)
    navigate(transactionFilterLocation(restored, 1, reportContext, reportContext.query), { bypassBlocker: true })
    setErrors([])
  }

  const retrySearch = () => {
    if (!confirmNavigation()) return
    cancelEditing()
    if (uncertainId) reconcileRead.current = { id: uncertainId, context: contextKey }
    setReloadGeneration(current => current + 1)
  }

  const applySavedFilters = (saved: TransactionFilters, apply: boolean) => {
    try {
      const query = buildTransactionQuery(saved, 1)
      if (!confirmNavigation()) return false
      cancelEditing()
      setFilters(saved)
      setPresetNeedsCorrection(!apply)
      setErrors([])
      if (apply) {
        navigate(transactionFilterLocation(saved, 1, reportContext, query), { bypassBlocker: true })
      }
      return true
    } catch (error) {
      setErrors(getErrorMessages(error))
      return false
    }
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingId || !editRequest || isSaving || uncertainId) return
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
    const stillInContext = captureContext()
    const normalizedRequest = {
      ...editRequest,
      description: editRequest.description.trim(),
      merchantName: editRequest.merchantName?.trim() || null,
      notes: editRequest.notes?.trim() || null,
    }
    try {
      await updateTransaction(currentHousehold.id, editingId, normalizedRequest)
      if (!stillInContext()) return
      recordOutcome(editingId, 'saved')
      cancelEditing()
      try { await refreshSavedTransaction(editingId) }
      catch {
        if (stillInContext()) setErrors(['Transaction saved, but the list could not be refreshed. Retry the search before comparing totals.'])
      }
    } catch (error) {
      if (stillInContext()) {
        setErrors(getErrorMessages(error))
        if (transactionGuideActive && !(error instanceof ApiError && [400, 422].includes(error.status))) setUncertainId(editingId)
      }
    } finally {
      if (stillInContext()) setIsSaving(false)
    }
  }

  const refreshSavedTransaction = async (id: string) => {
    const stillInContext = captureContext()
    if (!stillInContext()) return
    let result
    try {
      result = await getTransactions(currentHousehold.id, appliedQuery)
    } catch (error) {
      // Do not unmount other unsaved row editors, but never present stale totals.
      if (stillInContext()) setTotalsUnavailable(true)
      throw error
    }
    if (!stillInContext()) return
    const saved = result.items.find(transaction => transaction.id === id)
    // Refresh only this row: never unmount another editor with unsaved choices.
    setTransactions(current => current.flatMap(transaction =>
      transaction.id === id ? saved ? [saved] : [] : [transaction]))
    setPagination(result)
    setTotalsByCurrency(result.totalsByCurrency)
    setTotalsUnavailable(false)
  }

  const handleExport = async () => {
    if (isEditDirty && !window.confirm(
      'The export contains saved transactions only. Continue without saving your current edit?',
    )) {
      return
    }

    setIsExporting(true)
    setErrors([])
    const stillInContext = captureContext()
    try {
      await downloadTransactionsCsv(currentHousehold.id, appliedQuery)
    } catch (error) {
      if (stillInContext()) setErrors(getErrorMessages(error))
    } finally {
      if (stillInContext()) setIsExporting(false)
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
    <PageFrame contentClassName="transaction-content" footer={<><div id="read-tutorial-guide-host" /><div id="transaction-tutorial-guide-host" /><div id="categorization-tutorial-guide-host" /></>}>
        <TransactionsSectionNav />
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Household activity</p>
            <h1>Transactions</h1>
            <p>Search and edit transactions in BudgetApp while preserving their import history.</p>
            <p>One transaction can count in your Personal budget, the Household budget, or both.
              Account ownership and private import files do not change.</p>
          </div>
          <AppLink to="/import">Import CSV</AppLink>
        </div>

        <ContextualHelp topic="scope-privacy" />
        {lookupErrors.length > 0 && <section role="alert" className="error-summary">
          {lookupErrors.map(error => <p key={error}>{error}</p>)}
          <button type="button" data-tutorial-id="read-tour-reload" onClick={() => setLookupGeneration(current => current + 1)}>Retry account and category choices</button>
        </section>}
        {uncertainId ? <section role="alert" className="error-summary" data-tutorial-id="transaction-task-recovery">
          <p>The save result is uncertain. Check saved data before another correction.</p>
          {errors.map(error => <p key={error}>{error}</p>)}
          <button type="button" disabled={isLoading} onClick={retrySearch}>Check saved transaction</button>
        </section> :
        readTutorial && errors.length > 0 ? <section role="alert" className="error-summary">
          {errors.map(error => <p key={error}>{error}</p>)}
          <button type="button" data-tutorial-id="read-tour-reload" onClick={retrySearch}>Retry search</button>
        </section> : <ErrorSummary errors={errors} />}

        {reportContext && <aside className="transaction-report-context" aria-label="Annual report context">
          <strong>{matchesReport ? 'Annual overview drill-down'
            : 'View changed — no longer matches the original report filters'}</strong>
          <p>{matchesReport
            ? 'These are the spending transactions behind the report amount, including expense refunds.'
            : 'Filters or the household have changed. These results should not be compared with the original report amount.'}
            {' '}Totals use the latest saved transactions, not a frozen report snapshot.</p>
          {reportContext.householdId !== currentHousehold.id &&
            <p>Switch back to the original household to restore this drill-down.</p>}
          <div className="transaction-filter-actions">
            <AppLink to={annualReportReturnLink(reportContext.year, reportContext.scope)}>
              {reportContext.householdId === currentHousehold.id
                ? 'Return to Annual overview' : 'Annual overview for the current household'}
            </AppLink>
            {!matchesReport && reportContext.householdId === currentHousehold.id &&
              <button className="secondary-button" type="button" onClick={restoreReportFilters}>
                Restore report filters
              </button>}
          </div>
        </aside>}

        <SavedTransactionFilters key={currentHousehold.id} householdId={currentHousehold.id}
          appliedFilters={appliedFilters} pendingFilterChanges={pendingFilterChanges}
          onApply={applySavedFilters} disabled={isLoading} needsCorrection={presetNeedsCorrection} />

        <form className="transaction-filter-panel" data-tutorial-id="transaction-tour-form" onSubmit={handleApplyFilters}>
          <div className="transaction-filter-grid">
            <label><span>Currency</span>
              <input data-tutorial-id="transaction-tour-currency" value={filters.currency} maxLength={3} placeholder="All currencies"
                onChange={event => setFilters({ ...filters, currency: event.target.value.toUpperCase() })} />
            </label>
            <label className="checkbox-row"><input data-tutorial-id="transaction-tour-spending" type="checkbox" checked={filters.spendingOnly}
              onChange={event => setFilters({ ...filters, spendingOnly: event.target.checked })} />
              Spending only (includes expense refunds)</label>
            <label>
              <span>Budget inclusion</span>
              <select data-tutorial-id="transaction-tour-inclusion" value={filters.budgetInclusion} onChange={event =>
                setFilters({ ...filters, budgetInclusion: event.target.value })}>
                <option value="">All visible transactions</option>
                <option value="Personal">My personal budget (including shared expenses)</option>
                <option value="Household">Household budget (including personal-account expenses)</option>
                <option value="PersonalAndHousehold">Personal + Household</option>
                <option value="NotIncluded">Not included in my budgets</option>
              </select>
            </label>
            <label>
              <span>Account</span>
              <select data-tutorial-id="transaction-tour-account" value={filters.accountId} onChange={event =>
                setFilters({ ...filters, accountId: event.target.value })}>
                <option value="">All visible accounts</option>
                {filters.accountId && !accounts.some(account => account.id === filters.accountId) &&
                  <option value={filters.accountId}>Selected account (unavailable)</option>}
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name}{account.isActive ? '' : ' (deactivated)'}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Date filter</span>
              <select data-tutorial-id="transaction-tour-date-mode" value={filters.dateMode} onChange={event =>
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
                <input data-tutorial-id="transaction-tour-days" type="number" min="1" max="3650" step="1" required
                  value={filters.pastDays} onChange={event =>
                    setFilters({ ...filters, pastDays: event.target.value })} />
              </label>
            )}
            {filters.dateMode === 'specificDate' && (
              <label>
                <span>Date</span>
                <input data-tutorial-id="transaction-tour-date" type="date" required value={filters.specificDate} onChange={event =>
                  setFilters({ ...filters, specificDate: event.target.value })} />
              </label>
            )}
            {filters.dateMode === 'specificMonth' && (
              <label>
                <span>Month</span>
                <input data-tutorial-id="transaction-tour-month" type="month" required value={filters.specificMonth} onChange={event =>
                  setFilters({ ...filters, specificMonth: event.target.value })} />
              </label>
            )}
            {filters.dateMode === 'range' && (
              <>
                <label>
                  <span>From</span>
                  <input data-tutorial-id="transaction-tour-from" type="date" required value={filters.fromDate} onChange={event =>
                    setFilters({ ...filters, fromDate: event.target.value })} />
                </label>
                <label>
                  <span>To</span>
                  <input data-tutorial-id="transaction-tour-to" type="date" required value={filters.toDate} onChange={event =>
                    setFilters({ ...filters, toDate: event.target.value })} />
                </label>
              </>
            )}
            <label>
              <span>Category type</span>
              <select data-tutorial-id="transaction-tour-type" value={filters.categoryType} onChange={event => setFilters({
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
              <select data-tutorial-id="transaction-tour-category" value={filters.categoryId} onChange={event => setFilters({
                ...filters,
                categoryId: event.target.value,
                subcategoryId: '',
                categoryType: event.target.value === uncategorizedFilterValue
                  ? ''
                  : filters.categoryType,
              })}>
                <option value="">All categories</option>
                <option value={uncategorizedFilterValue}>Uncategorized only</option>
                {filters.categoryId && filters.categoryId !== uncategorizedFilterValue &&
                  !filterCategories.some(category => category.id === filters.categoryId) &&
                  <option value={filters.categoryId}>Selected category (unavailable)</option>}
                {filterCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.isActive ? '' : ' (deactivated)'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subcategory</span>
              <select data-tutorial-id="transaction-tour-subcategory" value={filters.subcategoryId} disabled={
                !filters.categoryId ||
                filters.categoryId === uncategorizedFilterValue
              }
                onChange={event => setFilters({ ...filters, subcategoryId: event.target.value })}>
                <option value="">All subcategories</option>
                {filters.subcategoryId && !filterSubcategories.some(category => category.id === filters.subcategoryId) &&
                  <option value={filters.subcategoryId}>Selected subcategory (unavailable)</option>}
                {filterSubcategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.isActive ? '' : ' (deactivated)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="transaction-description-filter">
              <span>Description contains</span>
              <input data-tutorial-id="transaction-tour-description" maxLength={250} value={filters.description} onChange={event =>
                setFilters({ ...filters, description: event.target.value })}
                placeholder="Merchant or description" />
            </label>
          </div>
          <div className="transaction-filter-actions">
            <button data-tutorial-id="transaction-tour-apply" className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Searching...' : 'Apply filters'}
            </button>
            <button data-tutorial-id="transaction-tour-reset" className="secondary-button" type="button" disabled={isLoading}
              onClick={handleResetFilters}>
              Reset filters
            </button>
            <button data-tutorial-id="transaction-tour-export" className="secondary-button" type="button"
              disabled={isLoading || isExporting || Boolean(location.error)} onClick={() => void handleExport()}>
              {isExporting ? 'Preparing export...' : 'Export matching transactions'}
            </button>
          </div>
        </form>

        <section className="transaction-active-filters" data-tutorial-id="transaction-tour-active" aria-label={reportContext ? 'Active report filters' : 'Active transaction filters'}>
          <h2>Active filters</h2>
          <dl>
            <div><dt>Household</dt><dd>{currentHousehold.name}</dd></div>
            <div><dt>Budget inclusion</dt><dd>{appliedQuery.budgetInclusion === 'PersonalAndHousehold' ? 'Personal + Household'
              : appliedQuery.budgetInclusion === 'NotIncluded' ? 'Not included in my budgets'
              : appliedQuery.budgetInclusion === 'Personal' ? 'My personal budget'
              : appliedQuery.budgetInclusion === 'Household' ? 'Household budget' : 'All visible transactions'}</dd></div>
            <div><dt>Period</dt><dd>{appliedQuery.fromDate ?? 'Any start date'} – {appliedQuery.toDate ?? 'Any end date'}</dd></div>
            <div><dt>Category</dt><dd>{activeCategory}{appliedQuery.categoryId &&
              !findCategorySelection(categories, appliedQuery.categoryId).subcategoryId
              ? ' (including subcategories)' : ''}</dd></div>
            <div><dt>Currency</dt><dd>{appliedQuery.currency || 'All currencies, totaled separately'}</dd></div>
            <div><dt>Transaction rules</dt><dd>{appliedQuery.spendingOnly
              ? 'Spending and expense refunds' : 'All transaction types'};
              {' '}{appliedQuery.budgetInclusion
                ? appliedQuery.budgetInclusion === 'NotIncluded'
                  ? 'not included in budgets; voided transactions omitted'
                  : 'budget-included only; excluded and voided transactions omitted'
                : 'includes excluded and ordinary voided transactions; undone imports omitted'}</dd></div>
            {appliedQuery.accountId && <div><dt>Account</dt><dd>
              {accounts.find(account => account.id === appliedQuery.accountId)?.name ?? 'Selected account'}
            </dd></div>}
            {appliedQuery.categoryType && <div><dt>Category type</dt><dd>{appliedQuery.categoryType}</dd></div>}
            {appliedQuery.description && <div><dt>Description contains</dt><dd>{appliedQuery.description}</dd></div>}
          </dl>
          {pendingFilterChanges && <p role="status">
            Filter edits are not applied yet. Results and export still use the active filters.
          </p>}
        </section>

        {!isLoading && !loadFailed && totalsUnavailable && <div className="transaction-matching-totals" role="status">
          <p>Matching totals could not be refreshed after saving. Retry the search before comparing amounts.</p>
          <button className="secondary-button" type="button" onClick={retrySearch}>Retry search</button>
        </div>}
        {!isLoading && !loadFailed && !totalsUnavailable && <section className="transaction-matching-totals"
          aria-label="Matching totals across all pages" aria-live="polite" data-tutorial-id="transaction-tour-totals">
          <h2>Matched amount</h2>
          <p>All {pagination.totalCount} matching transactions, across every page.</p>
          <div>{Object.entries(totalsByCurrency).sort(([a], [b]) => a.localeCompare(b))
            .map(([currency, amount]) => <strong key={currency}>{currency} {formatAmount(amount, currency)}</strong>)}
            {Object.keys(totalsByCurrency).length === 0 && (appliedQuery.currency
              ? <strong>{appliedQuery.currency} {formatAmount(0, appliedQuery.currency)}</strong>
              : <span>No matching amounts</span>)}
          </div>
          <small>Positive is spending; negative is income, a refund, or a credit. Currencies are never combined.</small>
        </section>}

        {!isLoading && !loadFailed && (
          <p className="transaction-result-summary" data-tutorial-id="transaction-tour-count">
            Showing {firstResult}–{lastResult} of {pagination.totalCount} matching transactions
          </p>
        )}

        {transactionGuideActive && <section className="transaction-filter-panel" data-tutorial-id="transaction-task-picker">
          <label><span>Transaction to review</span><select value={guideSelection ?? ''} disabled={!fresh || isSaving || Boolean(uncertainId) || Boolean(uncertainInclusion)}
            onChange={event => {
              if (!confirmNavigation()) return
              cancelEditing(); setGuideSelection(event.target.value || null)
            }}>
            <option value="">Choose a transaction…</option>
            <option value="review">Review results without editing</option>
            {guideSelection && guideSelection !== 'review' && !selectedRecord && <option value={guideSelection}>Selected record—not in this result page</option>}
            {transactions.map(row => <option key={row.id} value={row.id}>{row.transactionDate} · {row.description} · {row.currency} {row.amount}{row.canEdit ? '' : ' · Read only'}</option>)}
          </select></label>
          <p>Choosing a record does not change it. Use the page’s normal Edit and Save controls only if a correction is needed.</p>
        </section>}
        {transactionGuideActive && <section className="transaction-active-filters" data-tutorial-id="transaction-task-outcome" aria-live="polite">
          <h2>Selected transaction result</h2>
          {selectedOutcome?.kind === 'saved' ? <p>Save confirmed. {selectedRecord ? 'Check the current saved values below.' : 'The record is no longer in this result page. Broaden the search to inspect it.'}</p>
            : selectedOutcome?.kind === 'reloaded' ? <p>Saved results reloaded. Check actual values; this does not prove the original request succeeded.</p>
              : <p>No saved correction is required to review a correct record. Keep its saved values unchanged.</p>}
          {!fresh && <p>Current results are not verified yet. Retry the failed read before comparing.</p>}
        </section>}

        {loadFailed ? (
          <div className="empty-state">
            <h2>Could not load matching transactions</h2>
            <p>No reliable matching total is available. Your filters have been kept.</p>
            <button className="secondary-button" type="button" onClick={retrySearch}>Retry search</button>
          </div>
        ) : isLoading ? (
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
                  data-tutorial-id={transaction.id === guideSelection ? 'transaction-task-record' : undefined}
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
                    <span>{budgetInclusionLabel(transaction.includeInHouseholdBudget ?? false, transaction.includeInPersonalBudget ?? false)}</span>
                    {transaction.isVoided && <span>Voided</span>}
                  </div>
                  {transaction.canEdit ? (
                    <button className="text-button" type="button"
                      onClick={() => startEditing(transaction)}>
                      Edit
                    </button>
                  ) : <small>View only</small>}
                </article>

                <BudgetInclusionEditor key={transaction.id} householdId={currentHousehold.id}
                  transaction={transaction} disabled={editingId === transaction.id}
                  onStateChange={transactionGuideActive ? observeInclusion : undefined}
                  tutorialTargetId={transaction.id === uncertainInclusion ? 'transaction-task-inclusion-attention' : undefined}
                  onSaved={async reason => {
                    const stillInContext = captureContext()
                    if (!stillInContext()) throw new Error('The transaction context changed. Reload the current search before editing.')
                    if (reason !== 'reload') recordOutcome(transaction.id, 'saved')
                    await refreshSavedTransaction(transaction.id)
                    if (reason === 'reload' && stillInContext()) recordOutcome(transaction.id, 'reloaded')
                  }} />

                {editingId === transaction.id && editRequest && (
                  <form className="transaction-edit-form transaction-inline-edit" data-tutorial-id={transaction.id === guideSelection ? 'transaction-task-editor' : undefined}
                    onSubmit={(event) => void handleSave(event)}>
                    <div className="page-title-row">
                      <div>
                        <p className="eyebrow">Edit transaction</p>
                        <h2>{transaction.description}</h2>
                      </div>
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
                        <input aria-label="Amount" type="number" step="0.0001" required value={editRequest.amount}
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

                    <p data-tutorial-id={transaction.id === guideSelection ? 'transaction-task-effects' : undefined}>Budget inclusion is edited separately using “Include in budgets”.
                      Financial corrections affect every budget that includes this transaction.</p>

                    <div className="transaction-filter-actions" data-tutorial-id={transaction.id === guideSelection ? 'transaction-task-save' : undefined}>
                    <button className="text-button" type="button" disabled={isSaving}
                      onClick={() => void confirmDiscardEdit()}>Cancel</button>
                    <button className="primary-button" type="submit" disabled={isSaving || Boolean(uncertainId)}>
                      {isSaving ? 'Saving...' : 'Save transaction'}
                    </button>
                    </div>
                  </form>
                )}
              </Fragment>
            ))}
          </div>
        )}

        {!loadFailed && pagination.totalPages > 1 && (
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
    </PageFrame>
  )
}
