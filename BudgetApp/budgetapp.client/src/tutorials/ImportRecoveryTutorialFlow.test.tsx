import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { ImportReviewPage } from '../pages/ImportReviewPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getCategories } from '../categories/categoryApi'
import { getImports, getImportDraftPage, getImportCategorizationRulePreview, getImportReversalPreview, reverseImport, discardImport, completeImport, type ImportReviewDetail, type ImportReversalPreview } from '../imports/importApi'
import { draftPageFixture } from '../test/importReviewResponses'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { recoveryGate } from './importRecoveryTutorialState'
import { ApiError } from '../api/apiClient'
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../imports/importApi', async original => ({ ...await original<typeof import('../imports/importApi')>(), getImports: vi.fn(), getImportDraftPage: vi.fn(), getImportCategorizationRulePreview: vi.fn(), getImportReversalPreview: vi.fn(), reverseImport: vi.fn(), discardImport: vi.fn(), completeImport: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const id = '11111111-1111-1111-1111-111111111111'
let batch: ImportReviewDetail, preview: ImportReversalPreview, discarded: boolean
function Routes() { const { path } = useRouter(); const tutorial = useTutorials(); return <>{path === '/imports/review' ? <ImportReviewPage /> : <TutorialHubPage />}<output data-testid="step">{tutorial.activeTutorial ? tutorial.activeStepIndex : 'inactive'}</output></> }
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}><TutorialProvider><Routes /></TutorialProvider></HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Fix a mistaken import tutorial controls' })
async function click(name: string) { const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement; await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button) }
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function start() {
  const card = screen.getByRole('heading', { name: 'Fix a mistaken import' }).closest('article')!, button = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); await step(0); await click('Use this import'); await step(1)
}
async function finish() { await click('Next'); await step(5); await click('Continue import review'); await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('fix-mistaken-import', 1, 'Completed', 5)) }
async function openUndo() { await click('Check completed Undo'); await step(2); expect(getImportReversalPreview).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Preview undo' })); await click('Next'); await step(3) }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); vi.spyOn(window, 'confirm').mockReturnValue(true); discarded = false
  batch = { id, originalFileName: 'synthetic.xlsx', sourceWorksheetName: 'Transactions', accountName: 'Synthetic account', currency: 'CAD', status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0,
    approvedRows: 0, excludedRows: 0, duplicateRows: 0, canEdit: true, drafts: [{ id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-10-01', amount: -12.3456, description: 'Synthetic refund', importedCategoryName: null, importedSubcategoryName: null, selectedCategoryId: null,
      validationStatus: 'Valid', validationMessage: null, duplicateStatus: 'NoMatch', possibleMatchingTransactionId: null, reviewDecision: 'Pending', isDuplicateAcknowledged: false, includeInHouseholdBudget: false, includeInPersonalBudget: true, approvedTransactionId: null }] }
  preview = { previewVersion: 'A'.repeat(64), status: 'Completed', importFileId: id, originalFileName: batch.originalFileName, sourceWorksheetName: 'Transactions', accountName: batch.accountName, currency: 'CAD', importUpdatedAtUtc: '2026-10-15T12:00:00Z', checkedAtUtc: '2026-10-15T13:00:00Z', canReverse: true,
    linkedTransactionCount: 1, eligibleRowCount: 1, blockedRowCount: 0, blockingReasons: [], items: [{ draftId: 'row-a', sourceRowNumber: 2, transactionId: 'tx-a', transactionDate: '2026-10-01', amount: -12.3456, description: 'Synthetic refund', draftUpdatedAtUtc: '2026-10-15T12:00:00Z', transactionUpdatedAtUtc: '2026-10-15T12:00:00Z', isEligible: true, blockingReasons: [] }], page: 1, pageSize: 100, totalCount: 1, totalPages: 1 }
  vi.mocked(getCategories).mockResolvedValue([])
  vi.mocked(getImports).mockImplementation(async () => ({ items: discarded ? [] : [{ ...batch, uploadedAtUtc: '2026-10-15' }], page: 1, pageSize: 50, totalCount: discarded ? 0 : 1, totalPages: discarded ? 0 : 1, totalVisibleCount: discarded ? 0 : 1 }))
  vi.mocked(getImportDraftPage).mockImplementation(async (_hh, _id, filter, page) => draftPageFixture(batch, filter, page))
  vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({ fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0 })
  vi.mocked(getImportReversalPreview).mockImplementation(async () => structuredClone(preview))
  vi.mocked(reverseImport).mockImplementation(async () => { batch.status = 'Reversed'; return { importFileId: id, status: 'Reversed', reversedTransactionCount: 1, updatedAtUtc: '2026-10-16T12:00:00Z', alreadyReversed: false } })
  vi.mocked(discardImport).mockImplementation(async () => { discarded = true })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({ tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Mistaken import recovery guide', () => {
  it('keeps correct staged rows with no required correction, approval or discard', async () => {
    show(); await start(); await click('Correct staged rows'); await click('Next'); await click('Next'); await step(4); await finish()
    expect(discardImport).not.toHaveBeenCalled(); expect(reverseImport).not.toHaveBeenCalled(); expect(completeImport).not.toHaveBeenCalled()
  })
  it('honors a cancelled staged discard and offers keeping the file unchanged', async () => {
    show(); await start(); await click('Check staged discard'); await click('Next'); vi.mocked(window.confirm).mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Discard staged import' })); expect(discardImport).not.toHaveBeenCalled(); await click('Keep unchanged'); await finish()
  })
  it('uses the explicit discard reply and fresh list when the staged file is gone', async () => {
    show(); await start(); await click('Check staged discard'); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Discard staged import' }))
    await click('Next'); await step(4); expect(within(guide()).getByRole('heading', { name: 'Staged discard confirmed' })).toBeTruthy(); await finish()
    expect(discardImport).toHaveBeenCalledExactlyOnceWith('household-a', id); expect(reverseImport).not.toHaveBeenCalled()
  })
  it('reads eligibility only after Preview, then uses one normal whole-batch confirmation', async () => {
    batch.status = 'Completed'; show(); await start(); await openUndo(); expect(reverseImport).not.toHaveBeenCalled()
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' })); await click('Next'); await step(4); await finish()
    expect(reverseImport).toHaveBeenCalledExactlyOnceWith('household-a', id, 'A'.repeat(64)); expect(discardImport).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain(id)
  })
  it('keeps blocked batches unchanged without a deletion fallback', async () => {
    batch.status = 'Completed'; preview.canReverse = false; preview.blockedRowCount = 1; preview.eligibleRowCount = 0; preview.blockingReasons = ['A linked transaction was edited.']
    show(); await start(); await openUndo(); expect(screen.queryByRole('button', { name: 'Undo import' })).toBeNull(); await click('Keep unchanged'); await finish()
    expect(reverseImport).not.toHaveBeenCalled(); expect(discardImport).not.toHaveBeenCalled()
  })
  it('reconciles a lost undo response through the existing fresh preview, never another command', async () => {
    batch.status = 'Completed'; vi.mocked(reverseImport).mockImplementationOnce(async () => { preview.status = 'Reversed'; preview.canReverse = false; batch.status = 'Reversed'; throw new ApiError('Lost response', 0) })
    show(); await start(); await openUndo(); fireEvent.click(screen.getByRole('button', { name: 'Undo import' })); await screen.findByText('Refresh the undo preview to check the saved status before trying again.')
    expect((screen.getByRole('button', { name: 'Undo import' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' })); await click('Next'); await finish(); expect(reverseImport).toHaveBeenCalledOnce()
  })
  it.each(['Reversed', 'Completed'])('lets a Viewer review %s without acquiring write controls', async status => {
    batch.status = status; batch.canEdit = false; show('Viewer'); await start(); expect(screen.queryByRole('button', { name: 'Preview undo' })).toBeNull()
    await click('Review without changing'); await finish(); expect(reverseImport).not.toHaveBeenCalled(); expect(discardImport).not.toHaveBeenCalled()
  })
  it('waits for a successful preview read instead of interpreting failure as blocked/eligible', async () => {
    batch.status = 'Completed'; vi.mocked(getImportReversalPreview).mockRejectedValueOnce(new Error('Synthetic preview failure'))
    show(); await start(); await click('Check completed Undo'); fireEvent.click(screen.getByRole('button', { name: 'Preview undo' })); await screen.findByText('Synthetic preview failure')
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' })); await click('Next'); await click('Keep unchanged'); await finish()
  })
  it('blocks changed household/role/import and never treats a different discard as completion', () => {
    const task = { householdId: 'household-a', role: 'Owner', importId: id, url: '/imports/review', action: 'discard' as const }
    const page = { page: 'review' as const, householdId: 'household-a', importId: id, fresh: true, listFresh: true, canEdit: true, status: 'ReadyForReview', busy: false, dirty: false, pendingRows: 1, approvedRows: 0, totalRows: 1 }
    expect(recoveryGate(3, 'household-a', 'Owner', task, page, null).canNext).toBe(false)
    expect(recoveryGate(3, 'household-a', 'Owner', task, { ...page, importId: '', discardedImportId: id, fresh: false }, null).canNext).toBe(true)
    expect(recoveryGate(3, 'household-a', 'Owner', task, { ...page, importId: 'other', discardedImportId: 'other' }, null).canNext).toBe(false)
    expect(recoveryGate(3, 'household-a', 'Viewer', task, page, null).canNext).toBe(false)
    expect(recoveryGate(3, 'household-b', 'Owner', task, page, null).canNext).toBe(false)
  })
})
