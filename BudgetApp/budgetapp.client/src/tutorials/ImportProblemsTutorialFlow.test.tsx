import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { CsvImportPage } from '../pages/CsvImportPage'
import { ImportReviewPage } from '../pages/ImportReviewPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAccounts } from '../accounts/accountApi'
import { getCategories } from '../categories/categoryApi'
import { getImportProfiles, inspectImportFile, createImportProfile } from '../imports/importProfileApi'
import { getImports, getImportDraftPage, getImportCategorizationRulePreview, uploadCsvImport, decideImportDraft, saveImportDrafts, completeImport, type ImportReviewDetail } from '../imports/importApi'
import { draftPageFixture } from '../test/importReviewResponses'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { problemsGate } from './importProblemsTutorialState'
import { ApiError } from '../api/apiClient'
vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../imports/importProfileApi', async original => ({ ...await original<typeof import('../imports/importProfileApi')>(), getImportProfiles: vi.fn(), inspectImportFile: vi.fn(), createImportProfile: vi.fn() }))
vi.mock('../imports/importApi', async original => ({ ...await original<typeof import('../imports/importApi')>(), getImports: vi.fn(), getImportDraftPage: vi.fn(), getImportCategorizationRulePreview: vi.fn(), uploadCsvImport: vi.fn(), decideImportDraft: vi.fn(), saveImportDrafts: vi.fn(), completeImport: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const id = '11111111-1111-1111-1111-111111111111'
let batch: ImportReviewDetail
function Routes() { const { path } = useRouter(); const tutorial = useTutorials(); return <>{path === '/import' ? <CsvImportPage /> : path === '/imports/review' ? <ImportReviewPage /> : <TutorialHubPage />}<output data-testid="step">{tutorial.activeTutorial ? tutorial.activeStepIndex : 'inactive'}</output></> }
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}><TutorialProvider><Routes /></TutorialProvider></HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Resolve import problems tutorial controls' })
async function click(name: string) { const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement; await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button) }
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function start(mode: 'upload' | 'staged' | 'inspect') {
  const card = screen.getByRole('heading', { name: 'Resolve import problems' }).closest('article')!, button = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); await step(0)
  await click(mode === 'upload' ? 'Upload or file settings' : mode === 'staged' ? 'Staged rows or duplicates' : 'No current problem')
}
function file(name = 'synthetic.csv') { fireEvent.change(screen.getByLabelText(/^CSV or Excel file/), { target: { files: [new File(['synthetic'], name)] } }) }
async function finishStaged() { await click('Use this import'); await step(5); await click('Next'); await step(6); await click('Continue here') }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); vi.spyOn(window, 'confirm').mockReturnValue(true)
  batch = { id, originalFileName: 'synthetic.csv', accountName: 'Synthetic personal account', currency: 'CAD', status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0, approvedRows: 0, excludedRows: 0, duplicateRows: 1, canEdit: true,
    drafts: [{ id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-10-01', amount: -12.3456, description: 'Synthetic refund', importedCategoryName: null, importedSubcategoryName: null, selectedCategoryId: null,
      validationStatus: 'Valid', validationMessage: null, duplicateStatus: 'PossibleDuplicate', possibleMatchingTransactionId: 'existing-tx', reviewDecision: 'Pending', isDuplicateAcknowledged: false, includeInHouseholdBudget: false, includeInPersonalBudget: true, approvedTransactionId: null }] }
  vi.mocked(getAccounts).mockResolvedValue([{ id: 'account-a', name: 'Synthetic personal account', scope: 'Personal', type: 'Chequing', ownerUserId: 'test-user', currency: 'CAD', institutionName: null, lastFourDigits: null, isActive: true }])
  vi.mocked(getCategories).mockResolvedValue([]); vi.mocked(getImportProfiles).mockResolvedValue([])
  vi.mocked(inspectImportFile).mockResolvedValue({ headers: ['Date', 'Description', 'Amount'], previewRows: [['2026-10-01', 'Synthetic refund', '-12.3456']], matchedProfile: null, suggestedProfile: null })
  vi.mocked(uploadCsvImport).mockResolvedValue({ importFileId: id, originalFileName: batch.originalFileName, accountName: batch.accountName, status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 1 })
  vi.mocked(getImports).mockImplementation(async () => ({ items: [{ ...batch, uploadedAtUtc: '2026-10-15' }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1, totalVisibleCount: 1 }))
  vi.mocked(getImportDraftPage).mockImplementation(async (_hh, _id, filter, page) => draftPageFixture(batch, filter, page))
  vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({ fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0 })
  vi.mocked(decideImportDraft).mockImplementation(async (_hh, _id, _draft, decision, acknowledged) => {
    batch.drafts = batch.drafts.map(row => ({ ...row, reviewDecision: decision, isDuplicateAcknowledged: acknowledged })); batch.approvedRows = decision === 'Approved' ? 1 : 0; batch.excludedRows = decision === 'Excluded' ? 1 : 0
    return { summary: draftPageFixture(batch).summary, items: batch.drafts, removedDraftIds: [], savedRows: 1 }
  })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({ tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Import problems and duplicate guidance', () => {
  it('finishes a no-current-problem inspection without creating a corrupt example or uploading', async () => {
    show(); await start('inspect'); await step(6); await click('Continue here'); expect(uploadCsvImport).not.toHaveBeenCalled(); expect(decideImportDraft).not.toHaveBeenCalled()
  })
  it.each(['Owner', 'Viewer'] as const)('keeps %s duplicate decisions pending unless the user deliberately acts', async role => {
    show(role); await start('staged'); await finishStaged(); expect(decideImportDraft).not.toHaveBeenCalled(); expect(completeImport).not.toHaveBeenCalled()
    expect(batch.drafts[0].isDuplicateAcknowledged).toBe(false); expect(batch.drafts[0].reviewDecision).toBe('Pending')
  })
  it.each(['Approved', 'Excluded'] as const)('uses only the explicit page %s decision, never a tutorial acknowledgment', async decision => {
    show(); await start('staged'); await click('Use this import'); expect(decideImportDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: decision === 'Approved' ? 'Approve' : 'Exclude' })); await click('Next'); await click('Continue here')
    expect(decideImportDraft).toHaveBeenCalledWith('household-a', id, 'row-a', decision, decision === 'Approved', expect.any(String)); expect(completeImport).not.toHaveBeenCalled()
  })
  it('hands a confirmed upload to actual review from the normal page link without a second upload', async () => {
    show(); await start('upload'); file(); await click('Next'); await click('Next'); await step(3); expect(uploadCsvImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Upload for review' })); fireEvent.click(await screen.findByRole('link', { name: 'Review this import' })); await step(4); await finishStaged()
    expect(uploadCsvImport).toHaveBeenCalledExactlyOnceWith('household-a', 'account-a', expect.any(File), false); expect(completeImport).not.toHaveBeenCalled()
  })
  it('keeps repeated-file allowance off after a known duplicate-file warning until the user deliberately chooses it', async () => {
    vi.mocked(uploadCsvImport).mockRejectedValueOnce(new ApiError('Same file already exists. Confirm only if intentional.', 409))
    show(); await start('upload'); file(); await click('Next'); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Upload for review' }))
    await screen.findByText('Same file already exists. Confirm only if intentional.'); const allow = screen.getByLabelText(/Allow this file to be imported again/) as HTMLInputElement
    expect(allow.checked).toBe(false); expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(allow); fireEvent.click(screen.getByRole('button', { name: 'Upload for review' })); await click('Next'); await finishStaged()
    expect(uploadCsvImport).toHaveBeenLastCalledWith('household-a', 'account-a', expect.any(File), true); expect(decideImportDraft).not.toHaveBeenCalled()
  })
  it('blocks an uncertain upload retry and requires explicit saved-import inspection and selection', async () => {
    vi.mocked(uploadCsvImport).mockRejectedValueOnce(new ApiError('Lost upload reply', 0))
    show(); await start('upload'); file(); await click('Next'); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Upload for review' }))
    await screen.findByRole('link', { name: 'Check saved imports' }); expect((screen.getByRole('button', { name: 'Upload for review' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('link', { name: 'Check saved imports' })); await step(4); await finishStaged(); expect(uploadCsvImport).toHaveBeenCalledOnce(); expect(decideImportDraft).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain(id)
  })
  it('previews Excel before any staging, keeps worksheet context, and accepts the confirmed handoff', async () => {
    vi.mocked(inspectImportFile).mockResolvedValue({ headers: ['Date', 'Description', 'Amount'], previewRows: [['2026-10-01', 'Synthetic', '-12.3456']], matchedProfile: null, suggestedProfile: null,
      selectedWorksheetId: 'sheet-a', selectedWorksheetName: 'Transactions', worksheets: [{ id: 'sheet-a', name: 'Transactions', isHidden: false, transactionRows: 1, problem: null }] })
    show(); await start('upload'); file('synthetic.xlsx'); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' })); await screen.findByText('Selected worksheet:')
    expect(uploadCsvImport).not.toHaveBeenCalled(); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Upload for review' })); await click('Next'); await finishStaged()
    expect(uploadCsvImport).toHaveBeenCalledExactlyOnceWith('household-a', 'account-a', expect.any(File), false, undefined, 'sheet-a')
  })
  it('binds file selection and account/role instead of certifying a changed problem', () => {
    const task = { householdId: 'household-a', role: 'Owner', mode: 'upload' as const, accountId: 'account-a', fileRevision: 3 }
    const page = { page: 'upload' as const, householdId: 'household-a', accountId: 'account-a', loaded: true, canImport: true, fileType: 'xlsx' as const, fileRevision: 3, busy: false, stagedId: null }
    expect(problemsGate(2, 'household-a', 'Owner', task, page).canNext).toBe(true)
    expect(problemsGate(2, 'household-a', 'Owner', task, { ...page, fileRevision: 4 }).canNext).toBe(false)
    expect(problemsGate(2, 'household-a', 'Viewer', task, page).canNext).toBe(false)
    expect(problemsGate(3, 'household-a', 'Owner', task, page).canNext).toBe(false)
    expect(problemsGate(3, 'household-a', 'Owner', task, { ...page, stagedId: id, uncertain: true }).canNext).toBe(false)
  })
  it('treats invalid-row feedback as the task to inspect, but never finishes it as resolved before a saved correction', async () => {
    batch.invalidRows = 1; batch.validRows = 0; batch.drafts[0].amount = null; batch.drafts[0].validationStatus = 'Invalid'; batch.drafts[0].validationMessage = 'Invalid amount in source row 2.'
    vi.mocked(saveImportDrafts).mockImplementation(async (_hh, _id, updates) => {
      batch.invalidRows = 0; batch.validRows = 1; batch.drafts = batch.drafts.map(row => ({ ...row, ...updates[0], validationStatus: 'Valid', validationMessage: null }))
      return { summary: draftPageFixture(batch).summary, items: batch.drafts, removedDraftIds: [], savedRows: 1 }
    })
    show(); await start('staged'); await click('Use this import'); await step(5)
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-12.3456' } }); fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await click('Next'); await click('Continue here'); expect(saveImportDrafts).toHaveBeenCalledOnce(); expect(decideImportDraft).not.toHaveBeenCalled()
  })
  it('does not create a second profile after a lost mapping-save reply', async () => {
    vi.mocked(inspectImportFile).mockResolvedValue({ headers: ['When', 'What', 'Value'], previewRows: [['2026-10-01', 'Synthetic', '12.34']], matchedProfile: null,
      suggestedProfile: { id: 'suggested-profile', isActive: true, name: 'Synthetic mapping', headers: ['When', 'What', 'Value'], dateColumn: 'When', descriptionColumn: 'What', amountColumn: 'Value', debitColumn: null, creditColumn: null, categoryColumn: null, subcategoryColumn: null, amountConvention: 'SpendingPositive', defaultAccountId: null } })
    vi.mocked(createImportProfile).mockRejectedValueOnce(new ApiError('Lost profile reply', 0))
    show(); await start('upload'); file(); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Upload for review' })); await screen.findByRole('button', { name: 'Save profile and upload' })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile and upload' })); await screen.findByRole('link', { name: 'Check saved profiles' })
    expect((screen.getByRole('button', { name: 'Save profile and upload' }) as HTMLButtonElement).disabled).toBe(true); expect(createImportProfile).toHaveBeenCalledOnce(); expect(uploadCsvImport).not.toHaveBeenCalled()
    expect(within(guide()).queryByRole('button', { name: 'Inspect saved imports' })).toBeNull()
  })
})
