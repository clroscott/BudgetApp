import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { CsvImportPage } from '../pages/CsvImportPage'
import { ImportReviewPage } from '../pages/ImportReviewPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getCategories } from '../categories/categoryApi'
import { getImportProfiles, inspectImportFile, createImportProfile, type ImportProfileInspection } from '../imports/importProfileApi'
import { getImports, getImportDraftPage, getImportCategorizationRulePreview, uploadCsvImport,
  bulkReviewImportDrafts, completeImport, saveImportDrafts, type ImportReviewDetail } from '../imports/importApi'
import { draftPageFixture, mutationFixture } from '../test/importReviewResponses'
import { deferred } from '../test/deferred'
import { ApiError } from '../api/apiClient'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'

vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../imports/importProfileApi', async original => ({ ...await original<typeof import('../imports/importProfileApi')>(),
  getImportProfiles: vi.fn(), inspectImportFile: vi.fn(), createImportProfile: vi.fn() }))
vi.mock('../imports/importApi', async original => ({ ...await original<typeof import('../imports/importApi')>(),
  getImports: vi.fn(), getImportDraftPage: vi.fn(), getImportCategorizationRulePreview: vi.fn(), uploadCsvImport: vi.fn(),
  bulkReviewImportDrafts: vi.fn(), completeImport: vi.fn(), saveImportDrafts: vi.fn() }))

const id = '11111111-1111-1111-1111-111111111111'
const account: AccountItem = { id: 'account-a', name: 'Sample account', type: 'Chequing', scope: 'Personal', ownerUserId: 'test-user',
  currency: 'CAD', institutionName: null, lastFourDigits: null, isActive: true }
const staged = { importFileId: id, originalFileName: 'sample.csv', accountName: 'Sample account', status: 'ReadyForReview' as const,
  totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 }
const inspection: ImportProfileInspection = { headers: ['Date', 'Description', 'Amount'], previewRows: [['2026-10-01', 'Synthetic', '12.3456']],
  matchedProfile: null, suggestedProfile: null }
let batch: ImportReviewDetail

function Routes() {
  const { path } = useRouter()
  const tutorials = useTutorials()
  return <>
    {path === '/import' ? <CsvImportPage /> : path === '/imports/review' ? <ImportReviewPage /> : <TutorialHubPage />}
    {!tutorials.activeTutorial && <button onClick={() => void tutorials.start('import-review', true)}>Start import guide</button>}
  </>
}
function TestNavigationGuard({ enabled }: { enabled: boolean }) {
  const { registerNavigationGuard } = useRouter()
  useEffect(() => enabled ? registerNavigationGuard(() => 'Synthetic navigation guard') : undefined,
    [enabled, registerNavigationGuard])
  return null
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials')
  let household = householdsFixture()
  household.currentHousehold = { ...household.currentHousehold!, role }
  const auth = authFixture()
  let blocked = false
  const contents = () => <AuthContext.Provider value={auth}><RouterProvider><HouseholdContext.Provider value={household}>
    <TutorialProvider><TestNavigationGuard enabled={blocked} /><Routes /></TutorialProvider>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>
  const view = render(contents())
  return { ...view, blockNavigation: () => { blocked = true; view.rerender(contents()) }, changeHousehold: () => {
    household = { ...household, currentHousehold: { ...household.currentHousehold!, id: 'household-b' } }
    view.rerender(contents())
  } }
}
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
async function click(name: string) { const control = await screen.findByRole('button', { name }); await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(control) }
async function startUpload(filename = 'sample.csv') {
  await click('Start import guide'); await click('New CSV/Excel upload'); await click('Use this account')
  fireEvent.change(await screen.findByLabelText(/^CSV or Excel file/), { target: { files: [new File(['synthetic'], filename)] } })
  await click('Review file settings')
}

beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout()
  batch = { id, originalFileName: 'sample.csv', accountName: account.name, status: 'ReadyForReview', currency: 'CAD',
    totalRows: 1, validRows: 1, invalidRows: 0, approvedRows: 0, excludedRows: 0, duplicateRows: 0, canEdit: true,
    drafts: [{ id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-10-01', amount: 12.3456, description: 'Synthetic purchase',
      importedCategoryName: null, importedSubcategoryName: null, selectedCategoryId: null, validationStatus: 'Valid', validationMessage: null,
      duplicateStatus: 'NoMatch', possibleMatchingTransactionId: null, reviewDecision: 'Pending', isDuplicateAcknowledged: false,
      includeInHouseholdBudget: false, includeInPersonalBudget: true, approvedTransactionId: null }] }
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '2026-10-15', updatedAtUtc: '2026-10-15',
    completedAtUtc: status === 'Completed' ? '2026-10-15' : null, dismissedAtUtc: null }))
  vi.mocked(getAccounts).mockResolvedValue([account])
  vi.mocked(getImportProfiles).mockResolvedValue([])
  vi.mocked(getCategories).mockResolvedValue([])
  vi.mocked(inspectImportFile).mockResolvedValue(inspection)
  vi.mocked(uploadCsvImport).mockResolvedValue(staged)
  vi.mocked(getImports).mockImplementation(async () => ({ items: [{ ...batch, uploadedAtUtc: '2026-10-15' }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1, totalVisibleCount: 1 }))
  vi.mocked(getImportDraftPage).mockImplementation(async (_hh, _id, filter, page) => draftPageFixture(batch, filter, page))
  vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({ fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0 })
  vi.mocked(bulkReviewImportDrafts).mockImplementation(async () => { batch = { ...batch, approvedRows: 1, drafts: batch.drafts.map(d => ({ ...d, reviewDecision: 'Approved' })) } })
  vi.mocked(completeImport).mockImplementation(async () => {
    batch = { ...batch, status: 'Completed', drafts: batch.drafts.map(d => ({ ...d, approvedTransactionId: 'official-a' })) }
    return { importFileId: id, createdTransactionCount: 1, approvedRows: 1, excludedRows: 0, status: 'Completed' }
  })
})
afterEach(restoreTutorialLayout)

describe('real import pages with the guided task companion', () => {
  it('keeps the current page/step when the page-link handoff is canceled, without prompting twice', async () => {
    const view = show(); await startUpload(); await click('Upload for review')
    const link = await screen.findByRole('link', { name: 'Review this import' })
    await screen.findByRole('button', { name: 'Review staged import' })
    view.blockNavigation()
    vi.mocked(window.confirm).mockClear().mockReturnValue(false)
    fireEvent.click(link)
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/import')
    expect(screen.getByRole('heading', { name: 'Preview, map and stage' })).toBeTruthy()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(link)
    await screen.findByRole('heading', { name: 'Confirm the selected import' })
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(uploadCsvImport).toHaveBeenCalledOnce()
    expect(completeImport).not.toHaveBeenCalled()
  })

  it('follows the normal Review this import link to the matching tutorial checkpoint', async () => {
    show(); await startUpload(); await click('Upload for review')
    const link = await screen.findByRole('link', { name: 'Review this import' })
    await screen.findByRole('button', { name: 'Review staged import' })
    fireEvent.click(link)
    await screen.findByRole('heading', { name: 'Confirm the selected import' })
    expect(window.location.pathname).toBe('/imports/review')
    expect(new URLSearchParams(window.location.search).get('importId')).toBe(id)
    expect(screen.queryByRole('heading', { name: 'Preview, map and stage' })).toBeNull()
    await click('Use this import')
    await screen.findByRole('heading', { name: 'Check your rows' })
    expect(uploadCsvImport).toHaveBeenCalledOnce()
    expect(bulkReviewImportDrafts).not.toHaveBeenCalled()
    expect(completeImport).not.toHaveBeenCalled()
    expect(saveImportDrafts).not.toHaveBeenCalled()
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
    'does not advance this tab for a modified/new-tab review link click (%j)', async modifiers => {
      show(); await startUpload(); await click('Upload for review')
      const link = await screen.findByRole('link', { name: 'Review this import' })
      await screen.findByRole('button', { name: 'Review staged import' })
      const saves = vi.mocked(saveTutorialProgress).mock.calls.length
      // jsdom cannot open a real new document; suppress only that native action.
      document.addEventListener('click', event => event.preventDefault(), { once: true })
      fireEvent.click(link, modifiers)
      expect(window.location.pathname).toBe('/import')
      expect(screen.getByRole('heading', { name: 'Preview, map and stage' })).toBeTruthy()
      expect(saveTutorialProgress).toHaveBeenCalledTimes(saves)
      expect(uploadCsvImport).toHaveBeenCalledOnce()
      expect(completeImport).not.toHaveBeenCalled()
    },
  )

  it('highlights the main bulk-budget workflow and waits for an explicit save without requiring a change', async () => {
    vi.mocked(saveImportDrafts).mockImplementation(async (_household, _import, updates) => {
      const result = mutationFixture(batch, updates)
      batch = { ...batch, drafts: batch.drafts.map(draft => result.items.find(item => item.id === draft.id) ?? draft) }
      return result
    })
    show(); await click('Start import guide'); await click('Continue an existing import'); await click('Use this import')
    await click('Review budget inclusion')
    await screen.findByRole('heading', { name: 'Set budgets for many rows' })
    const target = document.querySelector<HTMLElement>('[data-tutorial-id="import-bulk-budget-tools"]')!
    await waitFor(() => expect(target.classList.contains('tutorial-task-target')).toBe(true))
    expect(target.closest('.import-control-prepare')).toBeTruthy()
    expect(within(target).getByRole('heading', { name: 'Set budgets for multiple rows' })).toBeTruthy()
    expect(within(target).getByRole('button', { name: 'Save all corrections (0)' })).toBeTruthy()
    expect(button('Review decisions').disabled).toBe(false) // Existing choices may be kept.
    expect(saveImportDrafts).not.toHaveBeenCalled()
    fireEvent.change(within(target).getByLabelText('Apply to'), { target: { value: 'page' } })
    fireEvent.change(within(target).getByLabelText('Bulk budget inclusion'), { target: { value: 'PersonalAndHousehold' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    await click('Apply budget choices (1)')
    await screen.findByText('Save your corrections on the page before continuing.')
    expect(button('Next').disabled).toBe(true)
    expect(saveImportDrafts).not.toHaveBeenCalled()
    await click('Save all corrections (1)')
    await click('Review decisions')
    await screen.findByRole('heading', { name: 'Approve or exclude' })
    expect(saveImportDrafts).toHaveBeenCalledExactlyOnceWith('household-a', id,
      [expect.objectContaining({ draftId: 'row-a', includeInPersonalBudget: true, includeInHouseholdBudget: true })], expect.any(String))
    expect(completeImport).not.toHaveBeenCalled()
  })

  it('stages, reviews, approves and creates only on user page actions, then replays without repeating them', async () => {
    show(); await startUpload()
    expect(uploadCsvImport).not.toHaveBeenCalled(); expect(createImportProfile).not.toHaveBeenCalled()
    expect(button('Next').disabled).toBe(true)
    const pending = deferred<typeof staged>()
    vi.mocked(uploadCsvImport).mockReturnValueOnce(pending.promise)
    await click('Upload for review')
    await screen.findByText('Working… Please wait.')
    expect(screen.queryByRole('button', { name: 'Review staged import' })).toBeNull()
    await act(async () => pending.resolve(staged))
    await click('Review staged import'); await click('Use this import')
    await screen.findByRole('heading', { name: 'Check your rows' })
    expect(document.querySelector('.tutorial-blocker')).toBeTruthy()
    expect(document.querySelector('.tutorial-layer.tutorial-task-guide')).toBeTruthy()
    expect(screen.getByText('More details').parentElement?.hasAttribute('open')).toBe(false)
    await click('Review budget inclusion'); await click('Review decisions')
    expect(button('Next').disabled).toBe(true)
    vi.mocked(window.confirm).mockReturnValue(true)
    await click('Approve all valid')
    await click('Review final creation')
    expect(completeImport).not.toHaveBeenCalled()
    expect(button('Next').disabled).toBe(true)
    await click('Create approved transactions')
    await click('Verify completed import')
    await screen.findByRole('heading', { name: 'You’re done!' })
    await click('Finish')
    expect(window.location.pathname).toBe('/tutorials')
    expect(uploadCsvImport).toHaveBeenCalledOnce(); expect(completeImport).toHaveBeenCalledOnce()
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('import-review', 1, 'Completed', 9))
    await click('Start import guide')
    await screen.findByRole('heading', { name: 'Choose your import task' })
    expect(uploadCsvImport).toHaveBeenCalledOnce(); expect(completeImport).toHaveBeenCalledOnce()
    expect(vi.mocked(saveTutorialProgress).mock.calls.every(args => args.length === 4 && typeof args[3] === 'number')).toBe(true)
  })

  it('shows Excel worksheet selection before staging and never treats Preview workbook as an upload outcome', async () => {
    vi.mocked(inspectImportFile).mockImplementation(async (_hh, _account, _file, worksheetId) => ({ ...inspection,
      worksheets: [{ id: '1', name: 'First', isHidden: false, transactionRows: 1, problem: null }, { id: '2', name: 'Second', isHidden: false, transactionRows: 1, problem: null }],
      selectedWorksheetId: worksheetId ?? null, selectedWorksheetName: worksheetId ? 'Second' : null }))
    show(); await startUpload('sample.xlsx')
    await waitFor(() => expect(document.querySelector('.tutorial-task-target')?.getAttribute('data-tutorial-id')).toBe('import-stage-submit'))
    await click('Preview workbook')
    await screen.findByRole('heading', { name: 'Choose one worksheet' })
    expect(uploadCsvImport).not.toHaveBeenCalled(); expect(button('Next').disabled).toBe(true)
    await waitFor(() => expect(document.querySelector('.tutorial-task-target')?.getAttribute('data-tutorial-id')).toBe('import-stage-worksheet'))
    fireEvent.change(screen.getByLabelText('Worksheet'), { target: { value: '2' } })
    await screen.findByText('Second', { selector: 'strong' })
    await waitFor(() => expect(document.querySelector('.tutorial-task-target')?.getAttribute('data-tutorial-id')).toBe('import-stage-submit'))
    await click('Upload for review')
    await screen.findByRole('button', { name: 'Review staged import' })
    await waitFor(() => expect(document.querySelector('.tutorial-task-target')?.getAttribute('data-tutorial-id')).toBe('import-stage-result'))
    expect(uploadCsvImport).toHaveBeenCalledExactlyOnceWith('household-a', 'account-a', expect.any(File), false, undefined, '2')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Import and review transactions tutorial controls' })).toBeNull())
    expect(completeImport).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/import')
  })

  it('does not advance a failed or uncertain upload or automatically retry it on Next/Restart', async () => {
    vi.mocked(uploadCsvImport).mockRejectedValueOnce(new ApiError('Unknown staging result', 0))
    show(); await startUpload(); await click('Upload for review')
    await screen.findByText('Unknown staging result')
    await screen.findByText('Needs attention')
    expect(screen.getByRole('alert', { name: 'Error notification' })).toBeTruthy()
    expect(document.querySelector('.tutorial-blocker')).toBeNull()
    expect(button('Next').disabled).toBe(true)
    fireEvent.click(button('Next'))
    fireEvent.click(screen.getByText('More details')); await click('Restart task selection')
    expect(uploadCsvImport).toHaveBeenCalledOnce(); expect(completeImport).not.toHaveBeenCalled()
  })

  it('keeps a duplicate-file rejection visible and continues only after an explicit corrected upload', async () => {
    const message = 'This account already has an import with the same file contents. Confirm that you want to import it again.'
    vi.mocked(uploadCsvImport).mockRejectedValueOnce(new ApiError(message, 409))
    show(); await startUpload(); await click('Upload for review')
    await screen.findByText(message)
    await screen.findByText('Needs attention')
    expect(button('Next').disabled).toBe(true)
    expect(document.querySelector('.tutorial-blocker')).toBeNull()
    await click('Show error')
    expect(uploadCsvImport).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('checkbox', { name: /Allow this file to be imported again/ }))
    expect(uploadCsvImport).toHaveBeenCalledOnce()
    await click('Upload for review')
    await click('Review staged import')
    expect(screen.queryByText('Needs attention')).toBeNull()
    expect(document.querySelector('.tutorial-blocker')).toBeTruthy()
    expect(uploadCsvImport).toHaveBeenCalledTimes(2)
    expect(completeImport).not.toHaveBeenCalled()
  })

  it('invalidates a changed household and ignores a late staging result instead of rebinding it', async () => {
    const pending = deferred<typeof staged>()
    vi.mocked(uploadCsvImport).mockReturnValueOnce(pending.promise)
    const view = show(); await startUpload(); await click('Upload for review')
    view.changeHousehold()
    await screen.findByText(/Household changed/)
    await act(async () => pending.resolve(staged))
    expect(screen.queryByRole('button', { name: 'Review staged import' })).toBeNull()
    expect(completeImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('More details')); await click('Restart task selection'); await click('New CSV/Excel upload'); await click('Use this account')
    expect((screen.getByLabelText(/^CSV or Excel file/) as HTMLInputElement).files?.length).toBe(0)
    expect(button('Next').disabled).toBe(true)
    expect(uploadCsvImport).toHaveBeenCalledOnce()
  })

  it('recognizes rendered task targets below the viewport without hiding the real form', async () => {
    const original = vi.mocked(HTMLElement.prototype.getBoundingClientRect).getMockImplementation()!
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset.tutorialId === 'import-upload-account'
        ? { x: 40, y: 1500, top: 1500, bottom: 1540, left: 40, right: 220, width: 180, height: 40, toJSON: () => ({}) }
        : original.call(this)
    })
    show(); await click('Start import guide'); await click('New CSV/Excel upload')
    await click('Use this account')
    expect(screen.getByRole('heading', { name: 'Choose a CSV or Excel file' })).toBeTruthy()
    expect(document.querySelector('[data-tutorial-inert]')).toBeNull()
  })

  it.each(['Owner', 'Viewer'] as const)('explains custom mapping and respects shared profile permission (%s)', async role => {
    const profile = { id: 'profile-a', name: 'Synthetic mapping', headers: ['Booked', 'Memo', 'Value'], dateColumn: 'Booked',
      descriptionColumn: 'Memo', amountColumn: 'Value', debitColumn: null, creditColumn: null, categoryColumn: null,
      subcategoryColumn: null, amountConvention: 'SpendingPositive' as const, defaultAccountId: 'account-a', isActive: true }
    vi.mocked(inspectImportFile).mockResolvedValue({ ...inspection, headers: profile.headers, suggestedProfile: profile })
    vi.mocked(createImportProfile).mockResolvedValue(profile)
    show(role); await startUpload(); await click('Upload for review')
    await screen.findByRole('heading', { name: 'Map these columns once' })
    await waitFor(() => expect(document.querySelector('.tutorial-task-target')?.getAttribute('data-tutorial-id')).toBe('import-stage-mapping'))
    expect(uploadCsvImport).not.toHaveBeenCalled(); expect(createImportProfile).not.toHaveBeenCalled()
    expect(button('Next').disabled).toBe(true)
    if (role === 'Viewer') {
      expect(button('Save profile and upload').disabled).toBe(true)
      fireEvent.click(button('Save profile and upload'))
      expect(createImportProfile).not.toHaveBeenCalled()
    } else {
      await click('Save profile and upload'); await screen.findByRole('button', { name: 'Review staged import' })
      expect(createImportProfile).toHaveBeenCalledOnce(); expect(uploadCsvImport).toHaveBeenCalledOnce()
    }
  })

  it.each([true, false])('resume reselects context and verifies a completed import without repeating writes (canEdit %s)', async canEdit => {
    batch = { ...batch, status: 'Completed', canEdit, approvedRows: 1, drafts: batch.drafts.map(d => ({ ...d, reviewDecision: 'Approved', approvedTransactionId: 'official-a' })) }
    vi.mocked(getTutorialProgress).mockResolvedValue([{ tutorialKey: 'import-review', tutorialVersion: 1, status: 'InProgress', currentStepIndex: 8,
      startedAtUtc: '2026-10-14', updatedAtUtc: '2026-10-14', completedAtUtc: null, dismissedAtUtc: null }])
    show(); await click('Start import guide'); await screen.findByRole('heading', { name: 'Choose your import task' })
    await click('Continue an existing import'); await click('Verify completed import')
    await screen.findByRole('heading', { name: 'You’re done!' })
    await click('Finish')
    expect(uploadCsvImport).not.toHaveBeenCalled(); expect(bulkReviewImportDrafts).not.toHaveBeenCalled(); expect(completeImport).not.toHaveBeenCalled()
  })

  it('keeps Viewer household-account actions gated but lets the user explicitly choose their own Personal account', async () => {
    vi.mocked(getAccounts).mockResolvedValue([{ ...account, id: 'household-account', name: 'Shared account', scope: 'Household', ownerUserId: null }, account])
    show('Viewer'); await click('Start import guide'); await click('New CSV/Excel upload')
    await screen.findByText(/Choose an active account you may import into/)
    expect(button('Next').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Import into account'), { target: { value: account.id } })
    await click('Use this account')
    expect(uploadCsvImport).not.toHaveBeenCalled()
  })
})
