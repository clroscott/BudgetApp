import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { ApiError } from '../api/apiClient'
import { HouseholdContext } from '../households/householdContext'
import { TutorialContext, type TutorialContextValue } from '../tutorials/tutorialContext'
import { RouterProvider } from '../routing/RouterProvider'
import { AppLink } from '../routing/AppLink'
import { getDashboardLayout, saveDashboardLayout, resetDashboardLayout } from '../dashboard/dashboardLayoutApi'
import { readDashboardSnapshot, type DashboardSnapshot } from '../dashboard/dashboardSnapshot'
import { authFixture, budgetFixture, householdsFixture, otherHousehold } from '../test/fixtures'
import { DashboardPage } from './DashboardPage'

vi.mock('../dashboard/dashboardLayoutApi', () => ({ getDashboardLayout: vi.fn(), saveDashboardLayout: vi.fn(), resetDashboardLayout: vi.fn() }))
vi.mock('../dashboard/dashboardSnapshot', async original => ({ ...await original<typeof import('../dashboard/dashboardSnapshot')>(), readDashboardSnapshot: vi.fn() }))
const defaultLayout = { preferredColumnCount: 3, visiblePanelKeys: ['financial-overview', 'needs-attention', 'quick-actions'], isDefault: true }
const amount = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(value)
const financialOverview = () => screen.getByRole('heading', { name: 'Financial overview' }).closest('article')!
const loadedAmounts = async (budgeted = 100, actual = 0) => waitFor(() => {
  expect(within(financialOverview()).getAllByRole('definition').map(node => node.textContent)).toEqual([
    amount(budgeted), amount(actual), amount(budgeted - actual),
  ])
})
const tutorial: TutorialContextValue = { activeTutorial: null, activeStepIndex: 0, isLoading: false, error: null,
  progress: [{ tutorialKey: 'getting-started', tutorialVersion: 1, status: 'Dismissed', currentStepIndex: 0, startedAtUtc: '2026-10-07T00:00:00Z', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: '' }],
  start: vi.fn(), dismiss: vi.fn(), exit: vi.fn(), next: vi.fn(), back: vi.fn() }
function snapshot(): DashboardSnapshot {
  return { budget: { ...budgetFixture(), budgetedAmount: 100, actualAmount: 0, remainingAmount: 100 },
    readyForReviewCount: 0, uncategorizedSpendingCount: 2,
    hasActiveAccount: false, hasVisibleTransactions: true, recent: null }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function show(role = 'Owner') {
  let households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  const content = () => <RouterProvider><AuthContext.Provider value={authFixture()}><HouseholdContext.Provider value={households}>
    <TutorialContext.Provider value={tutorial}><DashboardPage /><AppLink to="/destination">Leave dashboard</AppLink></TutorialContext.Provider>
  </HouseholdContext.Provider></AuthContext.Provider></RouterProvider>
  const rendered = render(content())
  return { ...rendered, switchHousehold: () => { households = { ...households, currentHousehold: otherHousehold }; rendered.rerender(content()) } }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getDashboardLayout).mockResolvedValue(defaultLayout)
  vi.mocked(resetDashboardLayout).mockResolvedValue(defaultLayout)
  vi.mocked(readDashboardSnapshot).mockResolvedValue(snapshot())
  vi.mocked(saveDashboardLayout).mockImplementation(async (_id, request) => ({ ...request, isDefault: false }))
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  window.history.replaceState(null, '', '/dashboard')
})
describe('mixed dashboard', () => {
  it('loads one summary without recent rows for the default layout', async () => {
    show(); await loadedAmounts()
    expect(readDashboardSnapshot).toHaveBeenCalledExactlyOnceWith('household-a', expect.any(String), 'Household', false)
  })
  it('waits for the saved layout and requests only its displayed recent card', async () => {
    const layout = deferred<typeof defaultLayout>()
    vi.mocked(getDashboardLayout).mockReturnValueOnce(layout.promise)
    const data = snapshot()
    data.recent = [{ id: 'recent-1', accountName: 'Shared expense (private account)', currency: 'USD', transactionDate: '2026-01-02', amount: 12.3456, description: 'Visible shared purchase' }]
    vi.mocked(readDashboardSnapshot).mockResolvedValue(data)
    show()
    expect(readDashboardSnapshot).not.toHaveBeenCalled()
    await act(async () => layout.resolve({ ...defaultLayout, visiblePanelKeys: ['recent-transactions'], isDefault: false }))
    await screen.findByText('Visible shared purchase')
    expect(readDashboardSnapshot).toHaveBeenCalledExactlyOnceWith('household-a', expect.any(String), 'Household', true)
    expect(screen.getByText(/Latest visible records across scopes and currencies/)).toBeTruthy()
  })
  it('loads recent rows when adding the card, but does not reload for column changes or reordering', async () => {
    vi.mocked(readDashboardSnapshot).mockImplementation(async (_id, _period, _scope, includeRecent) => ({ ...snapshot(), recent: includeRecent ? [] : null }))
    show(); await loadedAmounts()
    fireEvent.click(screen.getByRole('button', { name: 'Customize dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Recent transactions' }))
    await screen.findByText('No visible transactions yet.')
    expect(readDashboardSnapshot).toHaveBeenCalledTimes(2)
    expect(readDashboardSnapshot).toHaveBeenLastCalledWith('household-a', expect.any(String), 'Household', true)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Recent transactions earlier' }))
    expect(readDashboardSnapshot).toHaveBeenCalledTimes(2)
    fireEvent.click(within(screen.getByRole('heading', { name: 'Recent transactions' }).closest('article')!).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(readDashboardSnapshot).toHaveBeenLastCalledWith('household-a', expect.any(String), 'Household', false))
    expect(screen.queryByRole('heading', { name: 'Recent transactions' })).toBeNull()
  })
  it('uses setup existence flags even when no recent records were requested', async () => {
    const data = snapshot(); data.budget.id = null; data.hasVisibleTransactions = false; data.hasActiveAccount = true
    vi.mocked(readDashboardSnapshot).mockResolvedValue(data)
    show()
    const checklist = await screen.findByRole('region', { name: 'Getting started checklist' })
    expect(within(checklist).getByRole('link', { name: 'Add a financial account' }).closest('li')!.textContent).toContain('✓')
    expect(data.recent).toBeNull()
  })
  it('does not label a failed recent-card load as having no transactions', async () => {
    vi.mocked(getDashboardLayout).mockResolvedValue({ ...defaultLayout, visiblePanelKeys: ['recent-transactions'], isDefault: false })
    vi.mocked(readDashboardSnapshot).mockRejectedValueOnce(new Error('Read failed'))
    show()
    await screen.findByRole('alert', { name: 'dashboard summary load status' })
    expect(screen.queryByText('No visible transactions yet.')).toBeNull()
    expect(screen.getByText(/Summary data is unavailable/)).toBeTruthy()
  })
  it('shows the uncapped server review count and links to ready imports', async () => {
    const data = snapshot()
    data.readyForReviewCount = 120
    vi.mocked(readDashboardSnapshot).mockResolvedValue(data)
    show('Viewer')
    const link = await screen.findByRole('link', { name: 'Imports awaiting review' })
    await waitFor(() => expect(link.closest('li')!.querySelector('strong')!.textContent).toBe('120'))
    expect(link.getAttribute('href')).toBe('/imports/review?filter=ready')
    expect(screen.getByText(/You can still review imports from your own personal accounts/)).toBeTruthy()
  })
  it('shows three default cards with labeled amounts, scoped attention and read-only links', async () => {
    show()
    await loadedAmounts()
    expect(screen.getByRole('heading', { name: 'Financial overview' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Quick actions' })).toBeTruthy()
    expect(screen.getAllByRole('term').map(node => node.textContent)).toEqual(['Budgeted', 'Actual', 'Remaining'])
    expect(saveDashboardLayout).not.toHaveBeenCalled()
    expect(resetDashboardLayout).not.toHaveBeenCalled()
  })
  it('distinguishes no saved budget, budgeted zero and negative remaining without color alone', async () => {
    const data = snapshot(); data.budget.budgetedAmount = 0; data.budget.actualAmount = 10; data.budget.remainingAmount = -10
    vi.mocked(readDashboardSnapshot).mockResolvedValue(data)
    show()
    await screen.findByText(`Over budget by ${amount(10)}.`)
    expect(screen.queryByText(/No saved household budget/)).toBeNull()
  })
  it('shows setup guidance only after a successful empty response, without creating anything', async () => {
    const data = snapshot(); data.budget.id = null; data.hasVisibleTransactions = false
    vi.mocked(readDashboardSnapshot).mockResolvedValue(data)
    show()
    await screen.findByRole('region', { name: 'Getting started checklist' })
    expect(screen.getByText(/No saved household budget/)).toBeTruthy()
    expect(screen.queryByRole('definition')).toBeNull()
    expect(saveDashboardLayout).not.toHaveBeenCalled()
  })
  it('stops initial failures and retries a read without claiming that records are absent', async () => {
    vi.mocked(readDashboardSnapshot).mockRejectedValueOnce(new Error('Summary could not be read'))
    show()
    const alert = await screen.findByRole('alert', { name: 'dashboard summary load status' })
    expect(screen.queryByText(/No saved household budget/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Getting started checklist' })).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry loading' }))
    await loadedAmounts()
    expect(saveDashboardLayout).not.toHaveBeenCalled()
  })
  it('labels retained refresh data as stale and removes it if access is revoked', async () => {
    show(); await loadedAmounts()
    vi.mocked(readDashboardSnapshot).mockRejectedValueOnce(new Error('Refresh failed'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh data' })[0])
    const alert = await screen.findByRole('alert', { name: 'dashboard summary load status' })
    expect(screen.getByText(/Previously loaded data is shown below/)).toBeTruthy()
    expect(within(financialOverview()).getAllByText(amount(100))).toHaveLength(2)
    vi.mocked(readDashboardSnapshot).mockRejectedValueOnce(new ApiError('No access', 403))
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry loading' }))
    await screen.findByText('No access')
    expect(screen.queryAllByText(amount(100))).toHaveLength(0)
  })
  it('never labels a layout failure an empty dashboard', async () => {
    vi.mocked(getDashboardLayout).mockRejectedValue(new Error('Layout unavailable'))
    show()
    await screen.findByRole('alert', { name: 'dashboard layout load status' })
    expect(screen.queryByRole('heading', { name: 'Your dashboard is empty' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Customize dashboard' })).toBeNull()
  })
  it('clears old financial context immediately and ignores late responses after scope and household changes', async () => {
    const old = deferred<DashboardSnapshot>(); const latest = deferred<DashboardSnapshot>()
    const view = show(); await loadedAmounts()
    vi.mocked(readDashboardSnapshot).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    fireEvent.change(screen.getByLabelText('Budget scope'), { target: { value: 'Personal' } })
    expect(screen.queryAllByText(amount(100))).toHaveLength(0)
    view.switchHousehold()
    await act(async () => old.resolve(snapshot()))
    expect(screen.queryAllByText(amount(100))).toHaveLength(0)
    const data = snapshot(); data.budget.scope = 'Personal'; data.budget.budgetedAmount = 200; data.budget.remainingAmount = 200
    await act(async () => latest.resolve(data))
    await loadedAmounts(200)
    expect(readDashboardSnapshot).toHaveBeenLastCalledWith(otherHousehold.id, expect.any(String), 'Personal', false)
  })
  it('keeps existing saved shortcut choices rather than resetting them to the new default', async () => {
    vi.mocked(getDashboardLayout).mockResolvedValue({ preferredColumnCount: 2, visiblePanelKeys: ['accounts', 'categories'], isDefault: false })
    show()
    await screen.findByRole('heading', { name: 'Financial accounts' })
    expect(screen.queryByRole('heading', { name: 'Financial overview' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Household categories' })).toBeTruthy()
  })
  it('protects layout edits and preserves them after a failed save, then clears the guard on success', async () => {
    vi.mocked(saveDashboardLayout).mockRejectedValueOnce(new Error('Layout save failed'))
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Customize dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Recent transactions' }))
    fireEvent.click(screen.getByRole('link', { name: 'Leave dashboard' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }))
    await screen.findByText('Layout save failed')
    expect(screen.getByRole('heading', { name: 'Recent transactions' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save layout' })).toBeNull())
    expect(saveDashboardLayout).toHaveBeenLastCalledWith('household-a', { preferredColumnCount: 3, visiblePanelKeys: [...defaultLayout.visiblePanelKeys, 'recent-transactions'] })
    fireEvent.click(screen.getByRole('link', { name: 'Leave dashboard' }))
    expect(window.location.pathname).toBe('/destination')
    expect(window.confirm).toHaveBeenCalledOnce()
  })
  it('provides view-only quick actions and does not offer a setup checklist for viewers', async () => {
    const data = snapshot(); data.budget.id = null; data.hasVisibleTransactions = false
    vi.mocked(readDashboardSnapshot).mockResolvedValue(data)
    show('Viewer'); await screen.findByRole('heading', { name: 'Quick actions' })
    expect(screen.queryByRole('link', { name: 'Import transactions' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Getting started checklist' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'View monthly budget' })).toHaveLength(2)
  })
  it('disables layout editing while its save is pending, without sending a second write', async () => {
    const pending = deferred<typeof defaultLayout>()
    vi.mocked(saveDashboardLayout).mockReturnValueOnce(pending.promise)
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Customize dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Recent transactions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }))
    expect((screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Move Needs attention earlier' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '+ Financial accounts' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '2' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Saving...' }))
    expect(saveDashboardLayout).toHaveBeenCalledOnce()
    await act(async () => pending.resolve({ ...defaultLayout, isDefault: false, visiblePanelKeys: [...defaultLayout.visiblePanelKeys, 'recent-transactions'] }))
    expect(screen.queryByRole('button', { name: 'Save layout' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Recent transactions' })).toBeTruthy()
  })
  it('keeps keyboard focus in a meaningful place after adding and removing a card', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Customize dashboard' }))
    const add = screen.getByRole('button', { name: '+ Recent transactions' })
    add.focus(); fireEvent.click(add)
    const heading = screen.getByRole('heading', { name: 'Recent transactions' })
    expect(document.activeElement).toBe(heading)
    const remove = within(heading.closest('article')!).getByRole('button', { name: 'Remove' })
    remove.focus(); fireEvent.click(remove)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Quick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Customize dashboard' }))
  })
})
