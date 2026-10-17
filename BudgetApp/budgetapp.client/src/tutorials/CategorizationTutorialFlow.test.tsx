import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { TransactionManagementPage } from '../pages/TransactionManagementPage'
import { ImportReviewPage } from '../pages/ImportReviewPage'
import { CategorizationRuleManagementPage } from '../pages/CategorizationRuleManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAccounts } from '../accounts/accountApi'
import { getCategories } from '../categories/categoryApi'
import { getTransactions, updateTransaction, type TransactionItem } from '../transactions/transactionApi'
import { getImports, getImportDraftPage, getImportCategorizationRulePreview, saveImportDrafts, applyImportCategorizationRules, completeImport, type ImportReviewDetail } from '../imports/importApi'
import { getCategorizationRules, createCategorizationRule, type CategorizationRuleItem } from '../categorizationRules/categorizationRuleApi'
import { draftPageFixture, mutationFixture } from '../test/importReviewResponses'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { categorizationGate } from './categorizationTutorialState'

vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../components/SavedTransactionFilters', () => ({ SavedTransactionFilters: () => null }))
vi.mock('../transactions/transactionApi', async original => ({ ...await original<typeof import('../transactions/transactionApi')>(), getTransactions: vi.fn(), updateTransaction: vi.fn() }))
vi.mock('../imports/importApi', async original => ({ ...await original<typeof import('../imports/importApi')>(), getImports: vi.fn(), getImportDraftPage: vi.fn(), getImportCategorizationRulePreview: vi.fn(), saveImportDrafts: vi.fn(), applyImportCategorizationRules: vi.fn(), completeImport: vi.fn() }))
vi.mock('../categorizationRules/categorizationRuleApi', async original => ({ ...await original<typeof import('../categorizationRules/categorizationRuleApi')>(), getCategorizationRules: vi.fn(), createCategorizationRule: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const id = '11111111-1111-1111-1111-111111111111'
let transaction: TransactionItem
let batch: ImportReviewDetail
let rules: CategorizationRuleItem[]
function Routes() {
  const { path } = useRouter(); const tutorial = useTutorials()
  return <>{path === '/transactions' ? <TransactionManagementPage /> : path === '/imports/review' ? <ImportReviewPage /> : path === '/settings/categorization-rules' ? <CategorizationRuleManagementPage /> : <TutorialHubPage />}
    <output data-testid="step">{tutorial.activeTutorial ? tutorial.activeStepIndex : 'inactive'}</output></>
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}><TutorialProvider><Routes /></TutorialProvider></HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Categorize transactions tutorial controls' })
async function click(name: string) { const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement; await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button) }
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function start(mode: 'posted' | 'staged') {
  const card = screen.getByRole('heading', { name: 'Categorize transactions' }).closest('article')!
  const button = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); await step(0); await click(mode === 'posted' ? 'Saved Transactions' : 'Staged import rows'); await step(1)
  if (mode === 'posted') fireEvent.change(screen.getByLabelText('Transaction to review'), { target: { value: 'tx-a' } })
  else await screen.findByText(/Review transactions in sample.csv/)
  await click('Use this selection'); await step(2)
}
async function throughCorrection() { await click('Next'); await click('Next'); await step(4) }
async function finish() { await click('Continue categorizing'); await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('categorize-transactions', 1, 'Completed', 8)) }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); vi.spyOn(window, 'confirm').mockReturnValue(true)
  transaction = { id: 'tx-a', accountId: null, accountName: 'Synthetic', currency: 'CAD', categoryId: 'child-a', categoryName: 'Child', transactionDate: '2026-10-15', postedDate: null,
    amount: 12.3456, description: 'Synthetic purchase', merchantName: null, notes: null, source: 'Import', reviewStatus: 'Reviewed', isExcludedFromBudget: false, isVoided: false, canEdit: true, updatedAtUtc: '2026-10-15T00:00:00Z' }
  batch = { id, originalFileName: 'sample.csv', accountName: 'Synthetic', status: 'ReadyForReview', currency: 'CAD', totalRows: 1, validRows: 1, invalidRows: 0, approvedRows: 0, excludedRows: 0, duplicateRows: 0, canEdit: true,
    drafts: [{ id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-10-01', amount: 12.3456, description: 'Synthetic purchase', importedCategoryName: null, importedSubcategoryName: null,
      selectedCategoryId: 'child-a', validationStatus: 'Valid', validationMessage: null, duplicateStatus: 'NoMatch', possibleMatchingTransactionId: null, reviewDecision: 'Pending', isDuplicateAcknowledged: false,
      includeInHouseholdBudget: false, includeInPersonalBudget: true, approvedTransactionId: null }] }
  rules = [{ id: 'rule-a', name: 'Existing synthetic rule', matchField: 'Description', matchOperator: 'Contains', matchValue: 'Synthetic', accountId: null, targetCategoryId: 'child-a', priority: 0, isActive: true }]
  vi.mocked(getAccounts).mockResolvedValue([]); vi.mocked(getCategories).mockResolvedValue([{ id: 'parent-a', name: 'Parent', type: 'Expense', displayOrder: 0, isActive: true,
    children: [{ id: 'child-a', name: 'Child', type: 'Expense', displayOrder: 0, isActive: true, children: [] }] }])
  vi.mocked(getTransactions).mockImplementation(async () => ({ items: [structuredClone(transaction)], hasMore: false, page: 1, pageSize: 100, totalCount: 1, totalPages: 1, totalsByCurrency: { CAD: transaction.amount } }))
  vi.mocked(updateTransaction).mockImplementation(async (_hh, _id, request) => { transaction = { ...transaction, ...request } })
  vi.mocked(getImports).mockImplementation(async () => ({ items: [{ ...batch, uploadedAtUtc: '2026-10-15' }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1, totalVisibleCount: 1 }))
  vi.mocked(getImportDraftPage).mockImplementation(async (_hh, _id, filter, page) => draftPageFixture(batch, filter, page))
  vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({ fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 1 })
  vi.mocked(getCategorizationRules).mockImplementation(async () => structuredClone(rules))
  vi.mocked(createCategorizationRule).mockImplementation(async (_hh, request) => { rules.push({ ...request, id: 'created-rule', priority: 1, isActive: true }); return { id: 'created-rule' } })
  vi.mocked(saveImportDrafts).mockImplementation(async (_hh, _id, updates) => { const result = mutationFixture(batch, updates); batch.drafts = result.items; return result })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({ tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Category correction and optional rules', () => {
  it.each(['posted', 'staged'] as const)('keeps correct %s categories without any required write or approval', async mode => {
    show(); await start(mode); await throughCorrection(); await click('Finish without a rule'); await step(8); await finish()
    expect(updateTransaction).not.toHaveBeenCalled(); expect(saveImportDrafts).not.toHaveBeenCalled(); expect(createCategorizationRule).not.toHaveBeenCalled(); expect(completeImport).not.toHaveBeenCalled()
  })
  it('corrects a posted subcategory only with the actual Save transaction button', async () => {
    show(); await start('posted'); fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = document.querySelector('[data-tutorial-id="transaction-task-editor"]')!
    fireEvent.change(within(editor as HTMLElement).getByLabelText('Subcategory'), { target: { value: '' } }); await click('Next')
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(editor); await click('Next'); await click('Finish without a rule'); await finish()
    expect(updateTransaction).toHaveBeenCalledExactlyOnceWith('household-a', 'tx-a', expect.objectContaining({ categoryId: 'parent-a' }))
  })
  it('saves a staged category with the real Save all corrections action, without approving it', async () => {
    show(); await start('staged')
    fireEvent.change(screen.getByLabelText('Subcategory'), { target: { value: '' } }); await click('Next'); await step(3)
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' })); await click('Next'); await click('Finish without a rule'); await finish()
    expect(saveImportDrafts).toHaveBeenCalledOnce(); expect(batch.drafts[0].selectedCategoryId).toBe('parent-a'); expect(batch.drafts[0].reviewDecision).toBe('Pending'); expect(completeImport).not.toHaveBeenCalled()
  })
  it('keeps Reapply deliberate and honors a cancelled replacement confirmation', async () => {
    vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({ fillChangedRows: 0, reapplyChangedRows: 1, reapplyUnchangedRows: 0 })
    vi.mocked(applyImportCategorizationRules).mockResolvedValue({ matchedRows: 1, changedRows: 1, unchangedRows: 0 })
    show(); await start('staged'); await throughCorrection(); await click('Inspect or create a rule'); fireEvent.change(await screen.findByLabelText('Rule to review'), { target: { value: 'rule-a' } })
    await click('Next'); await click('Next'); const reapply = await screen.findByRole('button', { name: 'Reapply to all (1)' })
    vi.mocked(window.confirm).mockReturnValue(false); fireEvent.click(reapply); expect(applyImportCategorizationRules).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true); fireEvent.click(reapply); await click('Next'); await finish()
    expect(applyImportCategorizationRules).toHaveBeenCalledExactlyOnceWith('household-a', id, true); expect(completeImport).not.toHaveBeenCalled()
  })
  it.each(['posted', 'staged'] as const)('inspects an existing rule for %s without recreating or auto-applying it', async mode => {
    show(); await start(mode); await throughCorrection(); await click('Inspect or create a rule'); await step(5)
    fireEvent.change(await screen.findByLabelText('Rule to review'), { target: { value: 'rule-a' } }); await click('Next'); await step(6); await click('Next'); await step(7)
    if (mode === 'staged') expect((await screen.findByRole('button', { name: 'Fill uncategorized (0)' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Next'); await finish(); expect(createCategorizationRule).not.toHaveBeenCalled(); expect(applyImportCategorizationRules).not.toHaveBeenCalled()
  })
  it('allows a Viewer to inspect an existing rule and read-only posted category without edit permission', async () => {
    transaction.canEdit = false; show('Viewer'); await start('posted'); expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    await throughCorrection(); await click('Inspect or create a rule'); fireEvent.change(await screen.findByLabelText('Rule to review'), { target: { value: 'rule-a' } })
    expect(screen.queryByRole('button', { name: 'Create rule' })).toBeNull(); await click('Next'); await click('Next'); await click('Next'); await finish()
  })
  it('saves a new rule only explicitly, keeps its known ID, and does not repeat create on Back', async () => {
    show(); await start('posted'); await throughCorrection(); await click('Inspect or create a rule')
    fireEvent.change(await screen.findByLabelText('Rule to review'), { target: { value: 'new' } }); await click('Next'); await step(6)
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'New synthetic rule' } }); fireEvent.change(screen.getByLabelText('Match text'), { target: { value: 'New merchant' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'parent-a' } }); fireEvent.change(screen.getByLabelText('Subcategory'), { target: { value: 'child-a' } })
    expect(createCategorizationRule).not.toHaveBeenCalled(); fireEvent.submit(document.querySelector('.rule-form')!)
    await click('Next'); await step(7); await click('Back'); await step(6); expect(screen.queryByRole('button', { name: 'Create rule' })).toBeNull()
    await click('Next'); await click('Next'); await finish(); expect(createCategorizationRule).toHaveBeenCalledOnce(); expect(updateTransaction).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain('created-rule')
  })
  it('requires post-error saved-rule reads and explicit reselection after an uncertain create', async () => {
    show(); await start('posted'); await throughCorrection(); await click('Inspect or create a rule'); fireEvent.change(await screen.findByLabelText('Rule to review'), { target: { value: 'new' } }); await click('Next')
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Uncertain rule' } }); fireEvent.change(screen.getByLabelText('Match text'), { target: { value: 'Synthetic' } }); fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'parent-a' } })
    vi.mocked(createCategorizationRule).mockRejectedValueOnce(new Error('Lost reply')); fireEvent.submit(document.querySelector('.rule-form')!)
    await screen.findByRole('button', { name: 'Check saved rules' }); expect((screen.getByLabelText('Rule to review') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved rules' })); const select = screen.getByLabelText('Rule to review') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: 'rule-a' } })
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Back'); await click('Next'); await click('Next'); await click('Next'); await finish(); expect(createCategorizationRule).toHaveBeenCalledOnce()
  })
  it('does not turn a failed rule read into an empty or successful rule selection', async () => {
    show(); await start('posted'); await throughCorrection(); vi.mocked(getCategorizationRules).mockRejectedValueOnce(new Error('Synthetic rule read failure'))
    await click('Inspect or create a rule'); await screen.findByText('Synthetic rule read failure'); expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' })); const select = screen.getByLabelText('Rule to review') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: 'rule-a' } }); await click('Next'); await click('Next'); await click('Next'); await finish()
  })
  it('blocks changed batch/permissions and stale preview reads without retargeting', () => {
    const task = { householdId: 'household-a', role: 'Owner', mode: 'staged' as const, selection: id, optionalRules: true }
    const page = { page: 'review' as const, householdId: 'household-a', importId: id, fresh: true, canEdit: true, status: 'ReadyForReview', busy: false, dirty: false, pendingRows: 1, approvedRows: 0, totalRows: 1, rulesFresh: true }
    expect(categorizationGate(7, 'household-a', 'Owner', task, null, page, null).canNext).toBe(true)
    for (const changed of [{ ...page, importId: 'another' }, { ...page, rulesFresh: false }, { ...page, dirty: true }, { ...page, fresh: false }]) expect(categorizationGate(7, 'household-a', 'Owner', task, null, changed, null).canNext).toBe(false)
    expect(categorizationGate(7, 'household-a', 'Viewer', task, null, page, null).canNext).toBe(false)
  })
})
