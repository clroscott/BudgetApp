import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { householdsFixture, otherHousehold } from '../test/fixtures'
import { getCategories } from '../categories/categoryApi'
import { getAccounts } from '../accounts/accountApi'
import { getImportProfiles, inspectImportFile } from '../imports/importProfileApi'
import { getImports, getImport, getImportCategorizationRulePreview, bulkUpdateImportDrafts, updateImportDraft,
  uploadCsvImport, completeImport, type ImportListItem, type ImportListResult, type ImportReviewDetail } from '../imports/importApi'
import { ImportReviewPage } from './ImportReviewPage'
import { CsvImportPage } from './CsvImportPage'
import { deferred } from '../test/deferred'
import { draftPageFixture, mutationFixture } from '../test/importReviewResponses'
import { getImportDraftPage, getBudgetChoicePreview, saveImportDrafts, saveImportDraft } from '../imports/importApi'
import { decideImportDraft, deleteImportDraft } from '../imports/importApi'
import { ApiError } from '../api/apiClient'

vi.mock('../categories/categoryApi', async original => ({
  ...await original<typeof import('../categories/categoryApi')>(), getCategories: vi.fn(),
}))
vi.mock('../accounts/accountApi', async original => ({
  ...await original<typeof import('../accounts/accountApi')>(), getAccounts: vi.fn(),
}))
vi.mock('../imports/importProfileApi', async original => ({
  ...await original<typeof import('../imports/importProfileApi')>(), getImportProfiles: vi.fn(), inspectImportFile: vi.fn(),
}))
vi.mock('../imports/importApi', async original => ({
  ...await original<typeof import('../imports/importApi')>(), getImports: vi.fn(), getImport: vi.fn(),
  getImportCategorizationRulePreview: vi.fn(), bulkUpdateImportDrafts: vi.fn(), updateImportDraft: vi.fn(), uploadCsvImport: vi.fn(), completeImport: vi.fn(),
  getImportDraftPage: vi.fn(), getBudgetChoicePreview: vi.fn(), saveImportDrafts: vi.fn(), saveImportDraft: vi.fn(),
  decideImportDraft: vi.fn(), deleteImportDraft: vi.fn(),
}))

const listItem: ImportListItem = {
  id: 'import-a', originalFileName: 'sample.csv', accountName: 'Sample account',
  status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0,
  approvedRows: 0, excludedRows: 0, duplicateRows: 0, uploadedAtUtc: '2026-01-01', canEdit: true,
}
function detail(): ImportReviewDetail {
  return { ...listItem, currency: 'CAD', drafts: [{
    id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-01-01', amount: 100,
    description: 'Original description', importedCategoryName: null, importedSubcategoryName: null,
    selectedCategoryId: 'housing', validationStatus: 'Valid', validationMessage: null,
    duplicateStatus: 'NotDuplicate', possibleMatchingTransactionId: null,
    reviewDecision: 'Pending', isDuplicateAcknowledged: false, approvedTransactionId: null,
  }] }
}
function listPage(items: ImportListItem[], page = 1, totalCount = items.length): ImportListResult {
  return { items, page, pageSize: 50, totalCount, totalPages: Math.ceil(totalCount / 50), totalVisibleCount: totalCount }
}
function Routes({ children }: { children: ReactNode }) {
  const { path } = useRouter()
  return path === '/dashboard' ? <p>Destination</p> : <>{children}<AppLink to="/dashboard">Leave page</AppLink></>
}
function show(page: ReactNode, path = '/imports/review?importId=import-a') {
  window.history.replaceState(null, '', path)
  return render(<RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
    <Routes>{page}</Routes>
  </HouseholdContext.Provider></RouterProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCategories).mockResolvedValue([{ id: 'housing', name: 'Housing', type: 'Expense',
    displayOrder: 0, isActive: true, children: [] }])
  vi.mocked(getAccounts).mockResolvedValue([{ id: 'account-a', name: 'Sample account', type: 'Chequing',
    scope: 'Household', ownerUserId: null, currency: 'CAD', institutionName: null,
    lastFourDigits: null, isActive: true }])
  vi.mocked(getImportProfiles).mockResolvedValue([])
  vi.mocked(getImports).mockResolvedValue(listPage([listItem, { ...listItem, id: 'import-b', originalFileName: 'other.csv' }]))
  vi.mocked(getImport).mockResolvedValue(detail())
  let loadedBatch = detail()
  // getImport is a full-batch fixture supplier here, not a production request.
  vi.mocked(getImportDraftPage).mockImplementation(async (hh, id, filter, page, signal) => {
    loadedBatch = await getImport(hh, id, signal)
    return draftPageFixture(loadedBatch, filter, page)
  })
  vi.mocked(getBudgetChoicePreview).mockImplementation(async (_hh, _id, filter, personal, household, editedIds, version) => {
    const filtered = draftPageFixture(loadedBatch, filter).totalCount
    const candidates = loadedBatch.drafts.filter(draft => draftPageFixture({ ...loadedBatch, drafts: [draft] }, filter).totalCount > 0)
    const eligible = candidates.filter(draft => !draft.approvedTransactionId && draft.reviewDecision !== 'Excluded' &&
      draft.canChangePersonalInclusion !== false && (draft.canChangeHouseholdInclusion !== false || (draft.includeInHouseholdBudget ?? true) === household))
    const items = eligible.filter(draft => editedIds.includes(draft.id) ||
      (draft.includeInHouseholdBudget ?? true) !== household || (draft.includeInPersonalBudget ?? false) !== personal)
    return { items, skipped: filtered - eligible.length, unchanged: eligible.length - items.length, updatedAtUtc: version }
  })
  vi.mocked(saveImportDrafts).mockImplementation(async (hh, id, updates) => {
    await bulkUpdateImportDrafts(hh, id, updates)
    return mutationFixture(loadedBatch, updates)
  })
  vi.mocked(saveImportDraft).mockImplementation(async (hh, id, draftId, update) => {
    await updateImportDraft(hh, id, draftId, update)
    return mutationFixture(loadedBatch, [{ ...update, draftId }])
  })
  vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({
    fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0,
  })
})

describe('staged import edit protection', () => {
  it('does not present an old empty filter as an empty new filter while its page is loading', async () => {
    show(<ImportReviewPage />)
    const filter = await screen.findByLabelText('Show transactions') as HTMLSelectElement
    await waitFor(() => expect((screen.getByLabelText('Description') as HTMLInputElement).disabled).toBe(false))
    fireEvent.change(filter, { target: { value: 'uncategorized' } })
    await screen.findByText('No rows match this filter.')
    const pending = deferred<Awaited<ReturnType<typeof getImportDraftPage>>>()
    vi.mocked(getImportDraftPage).mockReturnValueOnce(pending.promise)
    fireEvent.change(filter, { target: { value: 'all' } })
    expect(screen.queryByText('No rows match this filter.')).toBeNull()
    expect(screen.getByText('Refreshing matching rows; the previous count is not current.')).toBeTruthy()
    await act(async () => pending.resolve(draftPageFixture(detail())))
    await screen.findByLabelText('Description')
    expect(screen.queryByText('No rows match this filter.')).toBeNull()
  })

  it('does not retain the previous household summary while loading the same URL in another household', async () => {
    const view = show(<ImportReviewPage />)
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    const pending = deferred<Awaited<ReturnType<typeof getImportDraftPage>>>()
    vi.mocked(getImportDraftPage).mockReturnValueOnce(pending.promise)
    vi.mocked(getImports).mockResolvedValue(listPage([]))
    view.rerender(<RouterProvider><HouseholdContext.Provider value={{ ...householdsFixture(), currentHousehold: otherHousehold }}>
      <Routes><ImportReviewPage /></Routes>
    </HouseholdContext.Provider></RouterProvider>)
    expect(screen.queryByRole('heading', { name: 'Review transactions in sample.csv' })).toBeNull()
    expect(screen.queryByText('Sample account · CAD')).toBeNull()
    await act(async () => pending.resolve(draftPageFixture({ ...detail(), originalFileName: 'other-household.csv' })))
    await screen.findByRole('heading', { name: 'Review transactions in other-household.csv' })
    expect(screen.queryByRole('heading', { name: 'Review transactions in sample.csv' })).toBeNull()
  })

  it('saves a single correction directly from the change response without rereading pages or the file list', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Direct correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save all corrections (0)' }) as HTMLButtonElement).disabled).toBe(true))
    expect(input.value).toBe('Direct correction')
    expect(getImportDraftPage).toHaveBeenCalledOnce()
    expect(getImports).toHaveBeenCalledOnce()
    expect(saveImportDraft).toHaveBeenCalledWith('household-a', 'import-a', 'row-a',
      expect.objectContaining({ description: 'Direct correction' }), '2026-10-14T12:00:00.0000000+00:00')
  })

  it('save-and-approve uses the corrected duplicate state and new version, without an intermediate page refresh', async () => {
    const original = { ...detail(), drafts: [{ ...detail().drafts[0], duplicateStatus: 'PossibleDuplicate' }] }
    vi.mocked(getImport).mockResolvedValue(original)
    const corrected = mutationFixture(detail(), [{ draftId: 'row-a', transactionDate: '2026-01-01', amount: 100,
      description: 'Changed duplicate', selectedCategoryId: 'housing' }])
    vi.mocked(saveImportDraft).mockResolvedValue(corrected)
    vi.mocked(decideImportDraft).mockResolvedValue({ ...corrected,
      summary: { ...corrected.summary, counts: { ...corrected.summary.counts, approvedRows: 1, pendingRows: 0, validPendingRows: 0 } },
      items: [{ ...corrected.items[0], reviewDecision: 'Approved' }] })
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Changed duplicate' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and approve' }))
    await waitFor(() => expect(decideImportDraft).toHaveBeenCalledExactlyOnceWith('household-a', 'import-a', 'row-a',
      'Approved', false, corrected.summary.updatedAtUtc))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save all corrections (1)' })).toBeNull())
    expect(getImportDraftPage).toHaveBeenCalledOnce()
    expect(getImports).toHaveBeenCalledOnce()
  })

  it('does not silently acknowledge a new possible duplicate revealed by saving a correction', async () => {
    const corrected = mutationFixture(detail(), [{ draftId: 'row-a', transactionDate: '2026-01-01', amount: 100,
      description: 'New match', selectedCategoryId: 'housing' }])
    corrected.items[0].duplicateStatus = 'PossibleDuplicate'
    vi.mocked(saveImportDraft).mockResolvedValue(corrected)
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'New match' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and approve' }))
    await screen.findByText('Your correction was saved and now matches an existing transaction. Review the possible duplicate before approving it.')
    expect(decideImportDraft).not.toHaveBeenCalled()
    expect(input.value).toBe('New match')
    expect(screen.getByText('Possible duplicate transaction')).toBeTruthy()
    expect(getImportDraftPage).toHaveBeenCalledOnce()
  })

  it('keeps corrections after a conflict and requires a read-only reload before another save', async () => {
    vi.mocked(saveImportDrafts).mockRejectedValueOnce(new ApiError('Import changed elsewhere', 409))
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Keep conflict correction' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save all corrections (1)' }))
    const reload = await screen.findByRole('button', { name: 'Reload rows without discarding corrections' })
    expect(input.value).toBe('Keep conflict correction')
    expect((screen.getByRole('button', { name: 'Save all corrections (1)' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(reload)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save all corrections (1)' }) as HTMLButtonElement).disabled).toBe(false))
    expect(input.value).toBe('Keep conflict correction')
    expect(saveImportDrafts).toHaveBeenCalledOnce()
    expect(getImportDraftPage).toHaveBeenCalledTimes(2)
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('refreshes rule counts after exclusion without reloading the file list or unchanged page', async () => {
    vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({ fillChangedRows: 1, reapplyChangedRows: 1, reapplyUnchangedRows: 0 })
    const excluded = mutationFixture(detail(), [])
    excluded.summary.counts = { ...excluded.summary.counts, pendingRows: 0, validPendingRows: 0, excludedRows: 1 }
    excluded.items = [{ ...detail().drafts[0], reviewDecision: 'Excluded' }]
    vi.mocked(decideImportDraft).mockResolvedValue(excluded)
    show(<ImportReviewPage />)
    await screen.findByRole('button', { name: 'Fill uncategorized (1)' })
    const exclude = screen.getByRole('button', { name: 'Exclude' }) as HTMLButtonElement
    await waitFor(() => expect(exclude.disabled).toBe(false))
    vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({ fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0 })
    fireEvent.click(exclude)
    await screen.findByRole('button', { name: 'Fill uncategorized (0)' })
    expect(getImportCategorizationRulePreview).toHaveBeenCalledTimes(2)
    expect(getImportDraftPage).toHaveBeenCalledOnce()
    expect(getImports).toHaveBeenCalledOnce()
  })

  it('removing the final row on page two clamps the page and leaves the controls usable', async () => {
    const batch = detail()
    batch.totalRows = 101
    batch.drafts = Array.from({ length: 101 }, (_, index) => ({ ...batch.drafts[0], id: `row-${index}`, sourceRowNumber: index + 2 }))
    vi.mocked(getImport).mockResolvedValue(batch)
    show(<ImportReviewPage />)
    const next = await screen.findByRole('button', { name: 'Next rows' }) as HTMLButtonElement
    await waitFor(() => expect(next.disabled).toBe(false))
    fireEvent.click(next)
    const row = await screen.findByRole('article', { name: 'CSV row 102' })
    fireEvent.click(within(row).getByRole('button', { name: 'Details' }))
    const reduced = { ...batch, totalRows: 100, drafts: batch.drafts.slice(0, 100) }
    vi.mocked(getImport).mockResolvedValue(reduced)
    vi.mocked(deleteImportDraft).mockResolvedValue({ summary: draftPageFixture(reduced).summary, items: [], removedDraftIds: ['row-100'], savedRows: 0 })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }))
    await screen.findByRole('article', { name: 'CSV row 2' })
    await waitFor(() => expect((screen.getByLabelText('Bulk budget inclusion') as HTMLSelectElement).disabled).toBe(false))
    expect(screen.queryByRole('navigation', { name: 'Import rows' })).toBeNull()
  }, 15_000)

  it('keeps row controls unavailable through the full selected-refresh chain', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    const list = deferred<ImportListResult>()
    vi.mocked(getImports).mockReturnValueOnce(list.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh selected import' }))
    await waitFor(() => expect(getImports).toHaveBeenCalledTimes(2))
    expect(input.disabled).toBe(true)
    await act(async () => list.resolve(listPage([listItem])))
    await waitFor(() => expect(input.disabled).toBe(false))
  })
  it('distinguishes initial detail failure, retained refresh failure, and safe read-only retry', async () => {
    vi.mocked(getImport).mockRejectedValueOnce(new Error('Initial detail outage'))
    show(<ImportReviewPage />)
    const failed = await screen.findByRole('alert', { name: 'selected import load status' })
    expect(screen.queryByLabelText('Description')).toBeNull()
    expect(screen.queryByText('No imports yet')).toBeNull()
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry loading' }))
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    vi.mocked(getImport).mockRejectedValueOnce(new Error('Refresh detail outage'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh selected import' }))
    const stale = await screen.findByRole('alert', { name: 'selected import load status' })
    expect(input.value).toBe('Original description')
    expect(input.disabled).toBe(true)
    fireEvent.click(within(stale).getByRole('button', { name: 'Retry loading' }))
    await waitFor(() => expect(input.disabled).toBe(false))
    expect(updateImportDraft).not.toHaveBeenCalled()
  })
  it('does not continue claiming no imports after an empty list fails to refresh', async () => {
    vi.mocked(getImports).mockResolvedValueOnce(listPage([]))
    show(<ImportReviewPage />, '/imports/review')
    await screen.findByRole('heading', { name: 'No imports yet' })
    vi.mocked(getImports).mockRejectedValueOnce(new Error('Empty-list refresh outage'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh import list' }))
    await screen.findByRole('alert', { name: 'import list load status' })
    expect(screen.queryByRole('heading', { name: 'No imports yet' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'No unfinished files' })).toBeNull()
  })
  it('offers a read-only retry when rule-preview loading fails', async () => {
    vi.mocked(getImportCategorizationRulePreview).mockRejectedValueOnce(new Error('Preview outage'))
    show(<ImportReviewPage />)
    const feedback = await screen.findByRole('alert', { name: 'categorization rule matches load status' })
    expect((screen.getByRole('button', { name: 'Fill uncategorized (unavailable)' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(feedback).getByRole('button', { name: 'Retry loading' }))
    await waitFor(() => expect(screen.queryByRole('alert', { name: 'categorization rule matches load status' })).toBeNull())
    expect(getImportCategorizationRulePreview).toHaveBeenCalledTimes(2)
    expect(updateImportDraft).not.toHaveBeenCalled()
  })
  it('does not replay completion when the write succeeds but its detail refresh fails', async () => {
    const reviewed = { ...detail(), approvedRows: 1, drafts: [{ ...detail().drafts[0], reviewDecision: 'Approved' }] }
    vi.mocked(getImport).mockResolvedValue(reviewed)
    vi.mocked(completeImport).mockResolvedValue({ importFileId: 'import-a', createdTransactionCount: 1, approvedRows: 1, excludedRows: 0, status: 'Completed' })
    show(<ImportReviewPage />)
    const create = await screen.findByRole('button', { name: 'Create approved transactions' }) as HTMLButtonElement
    await waitFor(() => expect(create.disabled).toBe(false))
    vi.mocked(getImport).mockRejectedValueOnce(new Error('Completion detail outage'))
    fireEvent.click(create)
    await screen.findByText(/Import completed\. Approved transactions were created\./)
    const stale = await screen.findByRole('alert', { name: 'selected import load status' })
    expect(create.disabled).toBe(true)
    vi.mocked(getImport).mockResolvedValue({ ...reviewed, status: 'Completed' })
    fireEvent.click(within(stale).getByRole('button', { name: 'Retry loading' }))
    await screen.findByText('Completed imports are retained to preserve the history of official transactions.')
    expect(screen.queryByText(/do not create the transactions again/)).toBeNull()
    expect(completeImport).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Create approved transactions' })).toBeNull()
  })
  it('does not clear B corrections when an A refresh finishes after switching the file-list context', async () => {
    const other = { ...detail(), id: 'import-b', originalFileName: 'other.csv', drafts: [{ ...detail().drafts[0], id: 'row-b', description: 'B description' }] }
    vi.mocked(getImport).mockImplementation(async (_householdId, id) => id === 'import-b' ? other : detail())
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    const oldList = deferred<ImportListResult>()
    vi.mocked(getImports).mockReturnValueOnce(oldList.promise).mockResolvedValue(listPage([{ ...listItem, id: 'import-b', originalFileName: 'other.csv' }]))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh selected import' }))
    await waitFor(() => expect(getImports).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByLabelText('File status'), { target: { value: 'all' } })
    const otherInput = await screen.findByDisplayValue('B description') as HTMLInputElement
    await waitFor(() => expect(otherInput.disabled).toBe(false))
    fireEvent.change(otherInput, { target: { value: 'Keep B correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    await act(async () => oldList.resolve(listPage([listItem])))
    expect(otherInput.value).toBe('Keep B correction')
    expect(screen.getByRole('button', { name: 'Save all corrections (1)' })).toBeTruthy()
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('import-b')
    expect(updateImportDraft).not.toHaveBeenCalled()
    expect(bulkUpdateImportDrafts).not.toHaveBeenCalled()
  })
  it('shows the original worksheet and Excel row provenance in review and row details', async () => {
    vi.mocked(getImports).mockResolvedValue(listPage([{ ...listItem, originalFileName: 'bank.xlsx', sourceWorksheetName: 'Chequing' }]))
    vi.mocked(getImport).mockResolvedValue({ ...detail(), originalFileName: 'bank.xlsx', sourceWorksheetName: 'Chequing' })
    show(<ImportReviewPage />)
    const row = await screen.findByRole('article', { name: 'Excel row 2' })
    expect(screen.getByText(/Row numbers refer to the original Excel worksheet/)).toBeTruthy()
    expect(screen.getByRole('option', { name: /bank.xlsx · Chequing/ })).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Details' }))
    await screen.findByText(/Worksheet Chequing · Excel row 2/)
  })
  it('bulk choices preserve row corrections, support cancellation, and save through the existing bulk endpoint', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    // Rows can render while the initial load still disables editing. Wait for
    // readiness and the dirty cache before testing preservation by bulk choices.
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'My correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    fireEvent.change(screen.getByLabelText('Bulk budget inclusion'), { target: { value: 'PersonalAndHousehold' } })
    const apply = await screen.findByRole('button', { name: 'Apply budget choices (1)' }) as HTMLButtonElement
    await waitFor(() => expect(apply.disabled).toBe(false))
    fireEvent.click(apply)
    expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(false)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apply budget choices (1)' }))
    await waitFor(() => expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(true))
    expect(input.value).toBe('My correction')
    expect(bulkUpdateImportDrafts).not.toHaveBeenCalled()
    const saved = detail()
    saved.drafts[0] = { ...saved.drafts[0], description: 'My correction', includeInHouseholdBudget: true, includeInPersonalBudget: true }
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockRejectedValueOnce(new Error('Bulk save failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('Bulk save failed')
    expect(input.value).toBe('My correction')
    expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(true)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenLastCalledWith('household-a', 'import-a', [
      expect.objectContaining({ draftId: 'row-a', description: 'My correction', includeInHouseholdBudget: true, includeInPersonalBudget: true }),
    ])
  })
  it('bulk choices honor the row filter and skip excluded or permission-protected rows', async () => {
    const batch = detail()
    batch.totalRows = 4
    batch.drafts = [batch.drafts[0],
      { ...batch.drafts[0], id: 'approved', reviewDecision: 'Approved' },
      { ...batch.drafts[0], id: 'excluded', reviewDecision: 'Excluded' },
      { ...batch.drafts[0], id: 'protected', canChangePersonalInclusion: false }]
    vi.mocked(getImport).mockResolvedValue(batch)
    show(<ImportReviewPage />)
    await screen.findByLabelText('Bulk budget inclusion')
    fireEvent.change(screen.getByLabelText('Show transactions'), { target: { value: 'pending' } })
    fireEvent.change(screen.getByLabelText('Bulk budget inclusion'), { target: { value: 'Personal' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    const apply = await screen.findByRole('button', { name: 'Apply budget choices (1)' }) as HTMLButtonElement
    await waitFor(() => expect(apply.disabled).toBe(false))
    fireEvent.click(apply)
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenCalledWith('household-a', 'import-a', [
      expect.objectContaining({ draftId: 'row-a', includeInHouseholdBudget: false, includeInPersonalBudget: true }),
    ])
  })
  it('supports current-page and all-matching choices across pagination', async () => {
    const batch = detail()
    batch.totalRows = 101
    batch.drafts = Array.from({ length: 101 }, (_, index) => ({ ...batch.drafts[0], id: `row-${index}`, sourceRowNumber: index + 2 }))
    vi.mocked(getImport).mockResolvedValue(batch)
    const { container } = show(<ImportReviewPage />)
    const preset = await screen.findByLabelText('Bulk budget inclusion') as HTMLSelectElement
    await waitFor(() => expect(preset.disabled).toBe(false))
    // A real 100-row page is intentionally retained. Scope accessibility queries
    // to the small toolbars, rather than traversing thousands of row controls.
    const bulkTools = within(preset.closest('section')!)
    const prepareTools = within(container.querySelector<HTMLElement>('.import-control-group')!)
    const pagination = within(screen.getByRole('navigation', { name: 'Import rows' }))
    fireEvent.change(bulkTools.getByLabelText('Apply to'), { target: { value: 'page' } })
    fireEvent.change(preset, { target: { value: 'PersonalAndHousehold' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(bulkTools.getByRole('button', { name: 'Apply budget choices (100)' }))
    await prepareTools.findByRole('button', { name: 'Save all corrections (100)' })
    const confirmationsBeforePaging = vi.mocked(window.confirm).mock.calls.length
    fireEvent.click(pagination.getByRole('button', { name: 'Next rows' }))
    expect((await screen.findByLabelText('My personal budget') as HTMLInputElement).checked).toBe(false)
    expect(window.confirm).toHaveBeenCalledTimes(confirmationsBeforePaging)
    fireEvent.change(bulkTools.getByLabelText('Apply to'), { target: { value: 'matching' } })
    const matching = await bulkTools.findByRole('button', { name: 'Apply budget choices (1)' }) as HTMLButtonElement
    await waitFor(() => expect(matching.disabled).toBe(false))
    fireEvent.click(matching)
    await prepareTools.findByRole('button', { name: 'Save all corrections (101)' })
    const saved = { ...batch, drafts: batch.drafts.map(draft => ({ ...draft,
      includeInPersonalBudget: true, includeInHouseholdBudget: true })) }
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 101 })
    fireEvent.click(prepareTools.getByRole('button', { name: 'Save all corrections (101)' }))
    // Await the complete save/refresh cycle; a mock invocation alone does not
    // mean the asynchronous handler has finished before the next test starts.
    await prepareTools.findByText('101 corrections were saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenCalledOnce()
    const updates = vi.mocked(bulkUpdateImportDrafts).mock.calls[0][2]
    expect(updates).toHaveLength(101)
    expect(new Set(updates.map(update => update.draftId)).size).toBe(101)
    expect(updates.every(update => update.includeInPersonalBudget && update.includeInHouseholdBudget)).toBe(true)
  }, 15_000) // Only this real, full-page scenario needs extra headroom on CI.
  it('does not offer bulk controls for completed imports', async () => {
    const completed = detail()
    completed.status = 'Completed'
    vi.mocked(getImports).mockResolvedValue(listPage([]))
    vi.mocked(getImport).mockResolvedValue(completed)
    show(<ImportReviewPage />)
    // A direct link remains open even outside the unfinished list.
    await screen.findByText('Completed imports are retained to preserve the history of official transactions.')
    expect(screen.queryByLabelText('Bulk budget inclusion')).toBeNull()
  })
  it('protects and bulk-saves budget inclusion choices without duplicating rows', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    // A row can render before its load completes. Exercise an enabled control
    // and wait for the parent dirty cache before attempting navigation.
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.click(screen.getByLabelText('My personal budget'))
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledOnce()
    const saved = detail()
    saved.drafts[0].includeInPersonalBudget = true
    saved.drafts[0].includeInHouseholdBudget = true
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenCalledWith('household-a', 'import-a', [
      expect.objectContaining({ draftId: 'row-a', includeInHouseholdBudget: true, includeInPersonalBudget: true }),
    ])
  })
  it('canceled route/import changes keep corrections, while safe row filters do not prompt', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Unsaved correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Uploaded file'), { target: { value: 'import-b' } })
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('import-a')
    fireEvent.change(screen.getByLabelText('File status'), { target: { value: 'completed' } })
    expect((screen.getByLabelText('File status') as HTMLSelectElement).value).toBe('inProgress')
    fireEvent.change(screen.getByLabelText('Show transactions'), { target: { value: 'uncategorized' } })
    await screen.findByText('No rows match this filter.')
    expect((screen.getByLabelText('Show transactions') as HTMLSelectElement).value).toBe('uncategorized')
    fireEvent.change(screen.getByLabelText('Show transactions'), { target: { value: 'all' } })
    expect((await screen.findByLabelText('Description') as HTMLInputElement).value).toBe('Unsaved correction')
    expect(window.confirm).toHaveBeenCalledTimes(3)
  })
  it('failed bulk saving retains corrections and protection; successful saving clears it', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Unsaved correction' } })
    vi.mocked(bulkUpdateImportDrafts).mockRejectedValueOnce(new Error('Sample correction failure'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('Sample correction failure')
    expect(input.value).toBe('Unsaved correction')
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    const saved = detail()
    saved.drafts[0].description = 'Unsaved correction'
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Destination')).toBeTruthy()
  })
  it.each(['bulk'])('preserves corrections after a successful %s save followed by a failed read; retry only reloads', async mode => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Saved correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    vi.mocked(updateImportDraft).mockResolvedValue(undefined)
    vi.mocked(getImport).mockRejectedValueOnce(new Error('Read unavailable after save'))
    if (mode === 'row') fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByRole('button', { name: mode === 'bulk' ? 'Save all corrections (1)' : 'Save corrections' }))
    const feedback = await screen.findByRole('alert', { name: 'selected import load status' })
    await screen.findByText(mode === 'bulk'
      ? '1 correction was saved. Retry refreshing the selected import before making more changes.'
      : 'Your correction was saved, but could not be refreshed. Retry refreshing the selected import before making more changes.')
    expect(input.value).toBe('Saved correction')
    expect((screen.getByRole('button', { name: 'Save all corrections (1)' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Approve all valid' }) as HTMLButtonElement).disabled).toBe(true)
    const saved = detail()
    saved.drafts[0].description = 'Saved correction'
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(within(feedback).getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('button', { name: 'Refresh selected import' })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save all corrections (0)' }) as HTMLButtonElement).disabled).toBe(true))
    expect(input.value).toBe('Saved correction')
    expect(bulkUpdateImportDrafts).toHaveBeenCalledTimes(mode === 'bulk' ? 1 : 0)
    expect(updateImportDraft).toHaveBeenCalledTimes(mode === 'row' ? 1 : 0)
  })
  it('preserves an explicitly cleared category across row hiding and reappearance', async () => {
    show(<ImportReviewPage />)
    const category = await screen.findByLabelText('Category') as HTMLSelectElement
    await waitFor(() => expect(category.disabled).toBe(false))
    fireEvent.change(category, { target: { value: '' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(screen.getByLabelText('Show transactions'), { target: { value: 'uncategorized' } })
    expect(screen.queryByLabelText('Description')).toBeNull()
    fireEvent.change(screen.getByLabelText('Show transactions'), { target: { value: 'all' } })
    expect((await screen.findByLabelText('Category') as HTMLSelectElement).value).toBe('')
  })
  it('protects rule-editor changes before leaving or closing that editor', async () => {
    show(<ImportReviewPage />)
    await screen.findByLabelText('Description')
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }))
    const match = await screen.findByLabelText('Match text') as HTMLInputElement
    fireEvent.change(match, { target: { value: 'Changed match text' } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(match.value).toBe('Changed match text')
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })
  it('only prompts for unsaved rule-editor changes when switching row filters or pages', async () => {
    const batch = detail()
    batch.totalRows = 101
    batch.drafts = Array.from({ length: 101 }, (_, index) => ({ ...batch.drafts[0], id: `row-${index}`, sourceRowNumber: index + 2 }))
    vi.mocked(getImport).mockResolvedValue(batch)
    show(<ImportReviewPage />)
    const firstRow = await screen.findByRole('article', { name: 'CSV row 2' })
    await waitFor(() => expect((within(firstRow).getByLabelText('Description') as HTMLInputElement).disabled).toBe(false))
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Details' }))
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Create rule' }))
    const match = await screen.findByLabelText('Match text') as HTMLInputElement
    fireEvent.change(match, { target: { value: 'Unsaved rule pattern' } })
    const next = screen.getByRole('button', { name: 'Next rows' }) as HTMLButtonElement
    await waitFor(() => expect(next.disabled).toBe(false))
    fireEvent.change(screen.getByLabelText('Show transactions'), { target: { value: 'uncategorized' } })
    expect((screen.getByLabelText('Show transactions') as HTMLSelectElement).value).toBe('all')
    expect(match.value).toBe('Unsaved rule pattern')
    fireEvent.click(next)
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(window.confirm).toHaveBeenLastCalledWith(
      'Discard your unsaved categorization-rule changes before changing rows? Transaction corrections will be kept.')
    expect(getImportDraftPage).toHaveBeenCalledOnce()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(next)
    await screen.findByRole('article', { name: 'CSV row 102' })
    expect(screen.queryByLabelText('Match text')).toBeNull()
    const previous = screen.getByRole('button', { name: 'Previous rows' }) as HTMLButtonElement
    await waitFor(() => expect(previous.disabled).toBe(false))
    fireEvent.click(previous)
    await screen.findByRole('article', { name: 'CSV row 2' })
    expect(window.confirm).toHaveBeenCalledTimes(3)
    expect(saveImportDraft).not.toHaveBeenCalled()
    expect(saveImportDrafts).not.toHaveBeenCalled()
  }, 15_000)
  it('does not silently refresh away a dirty row', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Unsaved correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }))
    expect(input.value).toBe('Unsaved correction')
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
})

describe('compact transaction review', () => {
  it('keeps editing, budget choices and review decisions on the main line; extra actions expand without losing corrections', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    const row = screen.getByRole('article', { name: 'CSV row 2' })
    const line = within(row.querySelector<HTMLElement>('.import-draft-line')!)
    expect(line.getByLabelText('Date')).toBeTruthy()
    expect(line.getByLabelText('Amount')).toBeTruthy()
    expect(line.getByLabelText('Category')).toBeTruthy()
    expect(line.getByLabelText('Subcategory')).toBeTruthy()
    expect(line.getByLabelText('My personal budget')).toBeTruthy()
    expect(line.getByLabelText('Household budget')).toBeTruthy()
    expect(line.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(line.getByRole('button', { name: 'Exclude' })).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'Remove' })).toBeNull()
    fireEvent.change(input, { target: { value: 'Compact correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    const details = line.getByRole('button', { name: 'Details' })
    expect(details.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(details)
    expect(details.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(details.getAttribute('aria-controls')!)).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Save corrections' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Save & create rule' })).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(input.value).toBe('Compact correction')
    fireEvent.click(details)
    expect(within(row).queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(input.value).toBe('Compact correction')
    expect(screen.getByRole('region', { name: 'Imported transactions' }).tabIndex).toBe(0)
  })

  it('keeps validation and duplicate warnings visible, and protected budget choices disabled', async () => {
    const invalid = detail()
    invalid.drafts[0] = { ...invalid.drafts[0], validationStatus: 'Invalid', validationMessage: 'Choose a valid date.',
      duplicateStatus: 'PossibleDuplicate', canChangePersonalInclusion: false }
    vi.mocked(getImport).mockResolvedValue(invalid)
    show(<ImportReviewPage />)
    const row = await screen.findByRole('article', { name: 'CSV row 2' })
    await waitFor(() => expect((within(row).getByLabelText('Description') as HTMLInputElement).disabled).toBe(false))
    expect(within(row).getByRole('alert').textContent).toBe('Choose a valid date.')
    expect(within(row).getByText('Possible duplicate transaction')).toBeTruthy()
    expect((within(row).getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(row).getByLabelText('My personal budget') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(within(row).getByRole('button', { name: 'Details' }))
    expect(within(row).getByText(/Another reviewer has chosen their/)).toBeTruthy()
  })

  it('allows read-only row details without exposing write actions', async () => {
    vi.mocked(getImport).mockResolvedValue({ ...detail(), canEdit: false })
    show(<ImportReviewPage />)
    const row = await screen.findByRole('article', { name: 'CSV row 2' })
    expect((within(row).getByLabelText('Description') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(within(row).getByRole('button', { name: 'Details' }))
    expect(within(row).getByText(/The full amount counts/)).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Create rule' })).toBeNull()
  })
})

describe('import file browsing', () => {
  it('restores selected files and status filters with Back/Forward and no extra automatic entries', async () => {
    const completed = { ...detail(), id: 'completed-b', originalFileName: 'completed.csv', status: 'Completed' }
    vi.mocked(getImports).mockImplementation(async (_id, filter) => listPage(filter === 'completed' ? [{ ...listItem, ...completed }] : [listItem]))
    vi.mocked(getImport).mockImplementation(async (_id, id) => id === 'completed-b' ? completed : detail())
    show(<ImportReviewPage />)
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    const status = screen.getByLabelText('File status')
    status.focus()
    const length = window.history.length
    fireEvent.change(status, { target: { value: 'completed' } })
    await screen.findByRole('heading', { name: 'Review transactions in completed.csv' })
    expect(window.history.length).toBe(length + 1)
    expect(document.activeElement).toBe(status)
    await act(async () => window.history.back())
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    expect((status as HTMLSelectElement).value).toBe('inProgress')
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('import-a')
    await act(async () => window.history.forward())
    await screen.findByRole('heading', { name: 'Review transactions in completed.csv' })
    expect((status as HTMLSelectElement).value).toBe('completed')
    expect(document.activeElement).toBe(status)
    expect(window.history.length).toBe(length + 1)
  })
  it('canceled file-query history preserves corrections and accepted Back/Forward restores the selected file', async () => {
    const other = { ...detail(), id: 'import-b', originalFileName: 'other.csv' }
    vi.mocked(getImport).mockImplementation(async (_id, id) => id === 'import-b' ? other : detail())
    show(<ImportReviewPage />)
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    fireEvent.change(screen.getByLabelText('Uploaded file'), { target: { value: 'import-b' } })
    await screen.findByRole('heading', { name: 'Review transactions in other.csv' })
    const input = screen.getByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    input.focus()
    fireEvent.change(input, { target: { value: 'Keep correction' } })
    const length = window.history.length
    await act(async () => window.history.back())
    await waitFor(() => expect(window.confirm).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.location.search).toContain('importId=import-b'))
    expect(input.value).toBe('Keep correction')
    expect(document.activeElement).toBe(input)
    expect(window.history.length).toBe(length)
    vi.mocked(window.confirm).mockReturnValue(true)
    await act(async () => window.history.back())
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    await act(async () => window.history.forward())
    await screen.findByRole('heading', { name: 'Review transactions in other.csv' })
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Original description')
    expect(window.history.length).toBe(length)
    expect(updateImportDraft).not.toHaveBeenCalled()
  })
  it('separates uploaded-file choices from transaction filtering and hides single-page file controls', async () => {
    show(<ImportReviewPage />)
    const filePicker = await screen.findByRole('region', { name: 'Choose an uploaded file' })
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    expect(within(filePicker).getByLabelText('File status')).toBeTruthy()
    expect(within(filePicker).getByLabelText('Uploaded file')).toBeTruthy()
    expect(within(filePicker).queryByLabelText('Show transactions')).toBeNull()
    expect(screen.getByLabelText('Show transactions')).toBeTruthy()
    expect(within(filePicker).getByRole('button', { name: 'Refresh import list' })).toBeTruthy()
    expect(within(filePicker).queryByRole('button', { name: 'Refresh selected import' })).toBeNull()
    expect(screen.getByText('2 matching uploaded files')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Import files' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next files' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Previous files' })).toBeNull()
  })

  it('loads a deep-linked import outside the current page without replacing its URL', async () => {
    const older = { ...detail(), id: 'old-import', originalFileName: 'older.csv' }
    vi.mocked(getImport).mockResolvedValue(older)
    vi.mocked(getImports).mockResolvedValue(listPage([listItem], 1, 61))
    show(<ImportReviewPage />, '/imports/review?importId=old-import&filter=all')
    await screen.findByRole('heading', { name: 'Review transactions in older.csv' })
    expect(new URLSearchParams(window.location.search).get('importId')).toBe('old-import')
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('old-import')
    expect(screen.getByRole('option', { name: 'older.csv — Sample account (ReadyForReview)' })).toBeTruthy()
    expect(screen.queryByText(/outside this list page/)).toBeNull()
    expect(getImports).toHaveBeenCalledWith('household-a', 'all', 1, expect.any(AbortSignal))
  })

  it('changing file status closes the old file and opens the first matching file', async () => {
    let resolve!: (value: ImportListResult) => void
    const completedList = new Promise<ImportListResult>(yes => { resolve = yes })
    const completed = { ...detail(), id: 'completed-b', originalFileName: 'completed.csv', status: 'Completed' }
    vi.mocked(getImport).mockImplementation(async (_householdId, id) => id === 'completed-b' ? completed : detail())
    show(<ImportReviewPage />)
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    vi.mocked(getImports).mockReturnValueOnce(completedList)
    fireEvent.change(screen.getByLabelText('File status'), { target: { value: 'completed' } })
    expect(screen.queryByRole('heading', { name: 'Review transactions in sample.csv' })).toBeNull()
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('')
    await act(async () => resolve(listPage([{ ...listItem, ...completed }])))
    await screen.findByRole('heading', { name: 'Review transactions in completed.csv' })
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('completed-b')
    expect(getImports).toHaveBeenLastCalledWith('household-a', 'completed', 1, expect.any(AbortSignal))
    expect(new URLSearchParams(window.location.search).get('importId')).toBe('completed-b')
    expect(screen.queryByRole('option', { name: /sample.csv/ })).toBeNull()
  })

  it('confirmed filter changes discard corrections and show an explicit empty status instead of the old file', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Correction to discard' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    vi.mocked(getImports).mockResolvedValue({ ...listPage([]), totalVisibleCount: 2 })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(screen.getByLabelText('File status'), { target: { value: 'completed' } })
    await screen.findByRole('heading', { name: 'No completed files' })
    expect(window.confirm).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByLabelText('Description')).toBeNull()
    expect(screen.queryByRole('option', { name: /sample.csv/ })).toBeNull()
    expect(new URLSearchParams(window.location.search).has('importId')).toBe(false)
    expect(bulkUpdateImportDrafts).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Leave page'))
    expect(screen.getByText('Destination')).toBeTruthy()
    expect(window.confirm).toHaveBeenCalledOnce()
  })

  it('failed filter loading does not reopen the old file or claim the matching files are absent', async () => {
    show(<ImportReviewPage />)
    await screen.findByRole('heading', { name: 'Review transactions in sample.csv' })
    vi.mocked(getImports).mockRejectedValueOnce(new Error('Completed list unavailable'))
    fireEvent.change(screen.getByLabelText('File status'), { target: { value: 'completed' } })
    const feedback = await screen.findByRole('alert', { name: 'import list load status' })
    expect(screen.queryByRole('heading', { name: 'No completed files' })).toBeNull()
    expect(screen.queryByLabelText('Description')).toBeNull()
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('')
    const completed = { ...detail(), id: 'completed-b', originalFileName: 'completed.csv', status: 'Completed' }
    vi.mocked(getImports).mockResolvedValue(listPage([{ ...listItem, ...completed }]))
    vi.mocked(getImport).mockResolvedValue(completed)
    fireEvent.click(within(feedback).getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('heading', { name: 'Review transactions in completed.csv' })
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('completed-b')
  })

  it('pages import files separately from rows and preserves the selected import', async () => {
    vi.mocked(getImports).mockImplementation(async (_id, _filter, page) => listPage(
      page === 2 ? [{ ...listItem, id: 'import-b', originalFileName: 'page-two.csv' }] : [listItem], page, 51))
    show(<ImportReviewPage />)
    const next = await screen.findByRole('button', { name: 'Next files' })
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false))
    next.focus()
    fireEvent.click(next)
    await screen.findByText(/File page 2 of 2/)
    expect(document.activeElement).toBe(next)
    expect(getImports).toHaveBeenLastCalledWith('household-a', 'inProgress', 2, expect.any(AbortSignal))
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('import-a')
    expect(screen.getByRole('heading', { name: 'Review transactions in sample.csv' })).toBeTruthy()
    expect(new URLSearchParams(window.location.search).get('page')).toBe('2')
    expect(screen.getByRole('option', { name: /page-two.csv/ })).toBeTruthy()
    await act(async () => window.history.back())
    await screen.findByText(/File page 1 of 2/)
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)
    await act(async () => window.history.forward())
    await screen.findByText(/File page 2 of 2/)
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('import-a')
  })

  it('canceled file paging and selected-import refresh retain unsaved corrections', async () => {
    vi.mocked(getImports).mockResolvedValue(listPage([listItem], 1, 51))
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Keep this correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    fireEvent.click(screen.getByRole('button', { name: 'Next files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh selected import' }))
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(getImports).toHaveBeenCalledTimes(1)
    expect(getImport).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('Keep this correction')
  })

  it('does not confuse list failure with no imports and offers a safe retry', async () => {
    vi.mocked(getImports).mockRejectedValueOnce(new Error('List unavailable'))
    show(<ImportReviewPage />, '/imports/review')
    const failure = await screen.findByRole('alert', { name: 'import list load status' })
    expect(screen.queryByText('No imports yet')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'No unfinished files' })).toBeNull()
    fireEvent.click(within(failure).getByRole('button', { name: 'Retry loading' }))
    await screen.findByLabelText('Description')
    expect(getImports).toHaveBeenCalledTimes(2)
  })

  it('keeps a dirty selected import when the list refresh fails', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Still here' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    vi.mocked(getImports).mockRejectedValueOnce(new Error('Refresh unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh import list' }))
    await screen.findByText('Could not refresh import list')
    expect(input.value).toBe('Still here')
    expect((screen.getByLabelText('Uploaded file') as HTMLSelectElement).value).toBe('import-a')
  })

  it('ignores a late list response after the status filter changes', async () => {
    let resolve!: (value: ImportListResult) => void
    const slow = new Promise<ImportListResult>(yes => { resolve = yes })
    vi.mocked(getImports).mockReturnValueOnce(slow).mockResolvedValue(listPage([
      { ...listItem, id: 'completed-b', originalFileName: 'completed.csv', status: 'Completed' },
    ]))
    show(<ImportReviewPage />)
    fireEvent.change(screen.getByLabelText('File status'), { target: { value: 'completed' } })
    await screen.findByRole('option', { name: /completed.csv/ })
    await act(async () => resolve(listPage([{ ...listItem, originalFileName: 'late.csv' }])))
    expect(screen.queryByRole('option', { name: /late.csv/ })).toBeNull()
    expect((screen.getByLabelText('File status') as HTMLSelectElement).value).toBe('completed')
  })

  it('shows unsuccessful imports as read-only and keeps ready-for-review filtering explicit', async () => {
    const failed = { ...detail(), status: 'Failed' }
    vi.mocked(getImport).mockResolvedValue(failed)
    show(<ImportReviewPage />, '/imports/review?importId=import-a&filter=ready')
    await screen.findByText(/This import is failed and is not ready for review/)
    expect(getImports).toHaveBeenCalledWith('household-a', 'ready', 1, expect.any(AbortSignal))
    expect((screen.getByLabelText('Description') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Create approved transactions' })).toBeNull()
  })

  it('can select another import after a direct-link read fails', async () => {
    vi.mocked(getImport).mockRejectedValueOnce(new Error('Import not found')).mockResolvedValue(detail())
    show(<ImportReviewPage />, '/imports/review?importId=missing-import')
    await screen.findByText('Could not load selected import')
    const select = screen.getByLabelText('Uploaded file') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    fireEvent.change(select, { target: { value: 'import-a' } })
    await screen.findByLabelText('Description')
    expect(select.value).toBe('import-a')
  })
})

describe('pending CSV uploads', () => {
  it.each(['profile-a', 'profile/other?download=true#"><img data-url-injection src=x>'])
  ('renders a safe template link for selected profile %s', async profileId => {
    vi.mocked(getImportProfiles).mockResolvedValue([{
      id: profileId, name: 'Sample CSV profile', headers: ['Date', 'Description', 'Amount'],
      dateColumn: 'Date', descriptionColumn: 'Description', amountColumn: 'Amount',
      debitColumn: null, creditColumn: null, categoryColumn: null, subcategoryColumn: null,
      amountConvention: 'SpendingPositive', defaultAccountId: null, isActive: true,
    }])
    show(<CsvImportPage />, '/import')
    await screen.findByRole('option', { name: 'Sample CSV profile' })
    fireEvent.change(screen.getByLabelText(/^Import profile/), { target: { value: profileId } })
    const link = await screen.findByRole('link', { name: 'Download selected profile template' })
    expect(link.getAttribute('href'))
      .toBe(`/api/households/household-a/import-profiles/${encodeURIComponent(profileId)}/template`)
    const url = new URL((link as HTMLAnchorElement).href)
    expect(url.origin).toBe(window.location.origin)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    expect(document.querySelector('[data-url-injection]')).toBeNull()
  })

  it('protects a selected file before upload and clears protection after a successful upload', async () => {
    show(<CsvImportPage />, '/import')
    const fileInput = await screen.findByLabelText(/^CSV or Excel file/)
    fireEvent.change(fileInput, { target: { files: [new File(['Date,Description,Amount\n2026-01-01,Sample,100'], 'sample.csv', { type: 'text/csv' })] } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    vi.mocked(inspectImportFile).mockResolvedValue({
      headers: ['Date', 'Description', 'Amount'], matchedProfile: null,
    } as Awaited<ReturnType<typeof inspectImportFile>>)
    vi.mocked(uploadCsvImport).mockResolvedValue({ importFileId: 'import-a', originalFileName: 'sample.csv',
      accountName: 'Sample account', status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 })
    fireEvent.submit(fileInput.closest('form')!)
    await waitFor(() => expect(uploadCsvImport).toHaveBeenCalledTimes(1))
    await screen.findByRole('link', { name: 'Review this import' })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Destination')).toBeTruthy()
  })
})
