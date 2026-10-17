import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { TransactionManagementPage } from '../pages/TransactionManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAccounts } from '../accounts/accountApi'
import { getCategories } from '../categories/categoryApi'
import { getTransactions, updateTransaction, updateBudgetInclusion, type TransactionItem, type TransactionListResult } from '../transactions/transactionApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { transactionTutorialGate, type TransactionTutorialPage } from './transactionTutorialState'
import { deferred } from '../test/deferred'

vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../components/SavedTransactionFilters', () => ({ SavedTransactionFilters: () => null }))
vi.mock('../transactions/transactionApi', async original => ({ ...await original<typeof import('../transactions/transactionApi')>(), getTransactions: vi.fn(), updateTransaction: vi.fn(), updateBudgetInclusion: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const original: TransactionItem = { id: 'tx-a', accountId: 'account-a', accountName: 'Disposable account', currency: 'CAD', categoryId: null, categoryName: null,
  transactionDate: '2026-10-15', postedDate: null, amount: 12.3456, description: 'Synthetic purchase', merchantName: null, notes: null,
  source: 'Import', reviewStatus: 'Reviewed', isExcludedFromBudget: false, isVoided: false, canEdit: true, includeInHouseholdBudget: false,
  includeInPersonalBudget: true, canEditHouseholdInclusion: true, updatedAtUtc: '2026-10-15T00:00:00Z' }
let records: TransactionItem[]
function Routes() {
  const { path } = useRouter(); const tutorial = useTutorials()
  return <>{path === '/transactions' ? <><TransactionManagementPage /><AppLink to="/tutorials">Leave transactions</AppLink></> : <TutorialHubPage />}
    <output data-testid="step">{tutorial.activeTutorial ? tutorial.activeStepIndex : 'inactive'}</output></>
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}><TutorialProvider><Routes /></TutorialProvider></HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Find and correct a transaction tutorial controls' })
async function click(name: string) {
  const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function start() {
  const card = screen.getByRole('heading', { name: 'Find and correct a transaction' }).closest('article')!
  const button = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); await step(0)
}
async function choose(selection = 'tx-a') {
  await click('Next'); await click('Next'); await step(2)
  fireEvent.change(screen.getByLabelText('Transaction to review'), { target: { value: selection } }); await click('Use this choice')
}
async function edit() { fireEvent.click(screen.getByRole('button', { name: 'Edit' })); await click('Next'); await step(4) }
async function finish() { await click('Next'); await step(7); await click('Continue with Transactions'); await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('inactive')) }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); vi.spyOn(window, 'confirm').mockReturnValue(true)
  records = [structuredClone(original)]
  vi.mocked(getAccounts).mockResolvedValue([]); vi.mocked(getCategories).mockResolvedValue([])
  vi.mocked(getTransactions).mockImplementation(async (): Promise<TransactionListResult> => ({ items: structuredClone(records), hasMore: false, page: 1, pageSize: 100, totalCount: records.length, totalPages: records.length ? 1 : 0,
    totalsByCurrency: records.length ? { CAD: records.reduce((sum, row) => sum + row.amount, 0) } : {} }))
  vi.mocked(updateTransaction).mockImplementation(async (_hh, id, request) => { records = records.map(row => row.id === id ? { ...row, ...request } : row) })
  vi.mocked(updateBudgetInclusion).mockImplementation(async (_hh, id, request) => { records = records.map(row => row.id === id ? { ...row, ...request } : row) })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({ tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Transaction search and correction tutorial', () => {
  it('keeps a correct record unchanged without any financial write, and returns to the task', async () => {
    show(); await start(); await choose(); await step(3); await click('Keep unchanged'); await step(6); await finish()
    expect(updateTransaction).not.toHaveBeenCalled(); expect(updateBudgetInclusion).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/transactions'); expect(saveTutorialProgress).toHaveBeenLastCalledWith('search-edit-transactions', 1, 'Completed', 7)
  })
  it.each([false, true])('lets a Viewer inspect canEdit=%s only through existing permitted controls', async canEdit => {
    records[0].canEdit = canEdit; show('Viewer'); await start(); await choose()
    if (canEdit) await click('Keep unchanged'); else { expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull(); await click('Next') }
    await finish(); expect(updateTransaction).not.toHaveBeenCalled()
  })
  it('finishes an empty search honestly without inventing a transaction', async () => {
    records = []; show(); await start(); await choose('review'); await step(7); await click('Return to tutorials')
    expect(updateTransaction).not.toHaveBeenCalled(); expect(window.location.pathname).toBe('/tutorials')
  })
  it('saves only on the actual page form and preserves signed four-decimal values and audit version', async () => {
    show(); await start(); await choose(); await edit()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-12.3456' } }); await click('Next'); await step(5)
    expect(updateTransaction).not.toHaveBeenCalled(); expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(document.querySelector('[data-tutorial-id="transaction-task-editor"]')!)
    await click('Next'); await step(6); await finish()
    expect(updateTransaction).toHaveBeenCalledExactlyOnceWith('household-a', 'tx-a', expect.objectContaining({ amount: -12.3456, updatedAtUtc: original.updatedAtUtc }))
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain('tx-a')
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain('Synthetic purchase')
  })
  it('handles a confirmed save that falls outside the current filter without another save', async () => {
    vi.mocked(updateTransaction).mockImplementationOnce(async () => { records = [] })
    show(); await start(); await choose(); await edit(); fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Different' } })
    fireEvent.submit(document.querySelector('[data-tutorial-id="transaction-task-editor"]')!); await click('Next'); await step(6)
    expect(within(guide()).getByRole('heading', { name: 'Saved—no longer in this search' })).toBeTruthy(); await finish(); expect(updateTransaction).toHaveBeenCalledOnce()
  })
  it('holds after a failed post-save refresh until an explicit read succeeds', async () => {
    show(); await start(); await choose(); await edit(); fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Saved value' } })
    vi.mocked(getTransactions).mockRejectedValueOnce(new Error('Synthetic refresh failure'))
    fireEvent.submit(document.querySelector('[data-tutorial-id="transaction-task-editor"]')!); await screen.findByText('Transaction saved, but the list could not be refreshed. Retry the search before comparing totals.')
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' })); await click('Next'); await step(6); await finish(); expect(updateTransaction).toHaveBeenCalledOnce()
  })
  it('requires a new explicit read after a lost save reply, rather than retrying the write', async () => {
    show(); await start(); await choose(); await edit(); fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Uncertain value' } })
    vi.mocked(updateTransaction).mockRejectedValueOnce(new Error('Lost reply')); fireEvent.submit(document.querySelector('[data-tutorial-id="transaction-task-editor"]')!)
    await screen.findByRole('button', { name: 'Check saved transaction' }); expect((screen.getByRole('button', { name: 'Save transaction' }) as HTMLButtonElement).disabled).toBe(true)
    const read = deferred<Awaited<ReturnType<typeof getTransactions>>>(); vi.mocked(getTransactions).mockReturnValueOnce(read.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved transaction' })); expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => read.resolve({ items: records, hasMore: false, page: 1, pageSize: 100, totalCount: 1, totalPages: 1, totalsByCurrency: { CAD: 12.3456 } }))
    await click('Next'); await step(6); expect(within(guide()).getByRole('heading', { name: 'Saved state reloaded' })).toBeTruthy(); await finish(); expect(updateTransaction).toHaveBeenCalledOnce()
  })
  it('observes separate row budget choices and does not finish over another unsaved editor', async () => {
    records.push({ ...original, id: 'tx-b', description: 'Another purchase' }); show(); await start(); await choose()
    const editors = screen.getAllByText('Include in budgets').map(summary => summary.closest('details')!)
    fireEvent.click(editors[1].querySelector('summary')!); fireEvent.click(within(editors[1]).getByLabelText('My personal budget'))
    expect(within(guide()).queryByRole('button', { name: 'Keep unchanged' })).toBeNull()
    fireEvent.click(within(editors[1]).getByRole('button', { name: 'Reset' })); await click('Keep unchanged'); await finish(); expect(updateBudgetInclusion).not.toHaveBeenCalled()
  })
  it('does not treat missing lookups as a successfully loaded empty list', async () => {
    vi.mocked(getCategories).mockRejectedValueOnce(new Error('Synthetic category failure')); show(); await start(); await screen.findByText('Synthetic category failure')
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry account and category choices' })); await choose(); await click('Keep unchanged'); await finish()
  })
  it('Escape exits without discarding edits and normal navigation still asks', async () => {
    show(); await start(); await choose(); await edit(); fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Keep my draft' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('inactive'))
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Keep my draft'); vi.mocked(window.confirm).mockReturnValue(false)
    fireEvent.click(screen.getByRole('link', { name: 'Leave transactions' })); expect(window.location.pathname).toBe('/transactions'); expect(updateTransaction).not.toHaveBeenCalled()
  })
  it('blocks a stale household, role, query or record instead of silently retargeting', () => {
    const task = { householdId: 'household-a', role: 'Owner', url: '/transactions?currency=CAD', selection: 'tx-a', baselineRevision: 2 }
    const page: TransactionTutorialPage = { householdId: 'household-a', url: task.url, fresh: true, busy: false, dirty: false, uncertain: false, pendingFilters: false, selection: 'tx-a', visible: true, canEdit: true, editingId: 'tx-a', outcomeRevision: 2, outcomeKind: 'saved' }
    expect(transactionTutorialGate(4, 'household-a', 'Owner', task, page).canNext).toBe(true)
    for (const changed of [{ ...page, selection: 'tx-b' }, { ...page, url: '/transactions' }, { ...page, fresh: false }, { ...page, editingId: 'tx-b' }])
      expect(transactionTutorialGate(4, 'household-a', 'Owner', task, changed).canNext).toBe(false)
    expect(transactionTutorialGate(4, 'household-b', 'Owner', task, page).canNext).toBe(false)
    expect(transactionTutorialGate(4, 'household-a', 'Viewer', task, page).canNext).toBe(false)
    expect(transactionTutorialGate(6, 'household-a', 'Owner', task, { ...page, editingId: null, visible: false }).canNext).toBe(false)
  })
})
