import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { authFixture, householdsFixture } from '../test/fixtures'
import { AnnualBudgetOverviewPage } from '../pages/AnnualBudgetOverviewPage'
import { TransactionManagementPage } from '../pages/TransactionManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAnnualBudgetOverview, type AnnualBudgetOverview } from '../budgets/annualBudgetOverviewApi'
import { getAccounts } from '../accounts/accountApi'
import { getCategories } from '../categories/categoryApi'
import { getTransactions, updateTransaction, downloadTransactionsCsv } from '../transactions/transactionApi'
import { getSavedFilters } from '../transactions/savedFilterApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { deferred } from '../test/deferred'
import { ActivityPage } from '../pages/ActivityPage'
import { getAuditEvents } from '../auditing/auditApi'
import { readTutorialGate } from './readTutorialState'
import { ImportReviewPage } from '../pages/ImportReviewPage'
import { getImports, getImportDraftPage, completeImport, saveImportDrafts, bulkReviewImportDrafts, discardImport } from '../imports/importApi'

vi.mock('../budgets/annualBudgetOverviewApi', () => ({ getAnnualBudgetOverview: vi.fn() }))
vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../transactions/transactionApi', () => ({ getTransactions: vi.fn(), updateTransaction: vi.fn(), downloadTransactionsCsv: vi.fn() }))
vi.mock('../transactions/savedFilterApi', () => ({ getSavedFilters: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
vi.mock('../auditing/auditApi', () => ({ getAuditEvents: vi.fn() }))
vi.mock('../imports/importApi', async original => ({ ...await original<typeof import('../imports/importApi')>(),
  getImports: vi.fn(), getImportDraftPage: vi.fn(), completeImport: vi.fn(), saveImportDrafts: vi.fn(), bulkReviewImportDrafts: vi.fn(), discardImport: vi.fn() }))

const report: AnnualBudgetOverview = { year: 2026, scope: 'Household', currency: 'CAD', actualAverageMonthCount: 10,
  budgetedMonthCount: 1, annualBudgetedAmount: 100, actualSpendingAmount: 25, remainingAmount: 75, incomeAmount: 200,
  netCashFlowAmount: 175, uncategorizedSpendingAmount: 25, currencyMismatchTransactionCount: 1,
  months: [{ budgetId: null, year: 2026, month: 1, status: null, budgetedAmount: null, actualSpendingAmount: 25,
    remainingAmount: null, incomeAmount: 200, netCashFlowAmount: 175 }], categories: [] }

function Routes() {
  const { path } = useRouter()
  const tutorials = useTutorials()
  return <>{path === '/budgeting/annual-overview' ? <AnnualBudgetOverviewPage />
    : path === '/activity' ? <ActivityPage />
    : path === '/transactions' ? <TransactionManagementPage />
    : path === '/imports/review' ? <ImportReviewPage /> : <TutorialHubPage />}
    <output data-testid="step">{tutorials.activeTutorial ? tutorials.activeStepIndex : 'inactive'}</output>
  </>
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials')
  let households = householdsFixture()
  households = { ...households, currentHousehold: { ...households.currentHousehold!, role } }
  const contents = () => <AuthContext.Provider value={authFixture()}><RouterProvider>
    <HouseholdContext.Provider value={households}><TutorialProvider><Routes /></TutorialProvider></HouseholdContext.Provider>
  </RouterProvider></AuthContext.Provider>
  const view = render(contents())
  return { changeRole: () => { households = { ...households, currentHousehold: { ...households.currentHousehold!, role: 'Admin' } }; view.rerender(contents()) } }
}
const guide = () => screen.getByRole('region', { name: 'Read the Annual Overview tutorial controls' })
async function click(name: string) {
  const button = await within(guide()).findByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function launch(title = 'Read the Annual Overview') {
  const card = screen.getByRole('heading', { name: title }).closest('article')!
  const start = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(start.disabled).toBe(false))
  fireEvent.click(start); await step(0)
}
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout()
  vi.mocked(getAnnualBudgetOverview).mockImplementation(async (_hh, year, scope) => ({ ...structuredClone(report), year, scope }))
  vi.mocked(getAccounts).mockResolvedValue([]); vi.mocked(getCategories).mockResolvedValue([])
  vi.mocked(getTransactions).mockResolvedValue({ items: [], hasMore: false, page: 1, pageSize: 100, totalCount: 0, totalPages: 0, totalsByCurrency: {} })
  vi.mocked(getSavedFilters).mockResolvedValue([])
  vi.mocked(getImports).mockResolvedValue({ items: [], page: 1, pageSize: 25, totalCount: 0, totalPages: 0, totalVisibleCount: 0 })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(getAuditEvents).mockResolvedValue({ items: [{ id: 'event-a', actorUserId: 'user-a', actorDisplayName: 'Sample person',
    visibility: 'Household', occurredAtUtc: '2026-10-16T12:00:00Z', action: 'BudgetSaved', entityType: 'Budget', entityId: 'budget-a',
    summary: 'Sample budget saved', details: { Scope: 'Household' } }], page: 1, pageSize: 50, totalCount: 51, totalPages: 2,
    filters: { actors: [{ userId: 'user-a', displayName: 'Sample person' }], actions: ['BudgetSaved'], entityTypes: ['Budget'] } })
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})

describe('Spending-total evidence checklist', () => {
  const controls = () => screen.getByRole('region', { name: 'Why don’t these totals match? tutorial controls' })
  const next = async () => {
    const button = within(controls()).getByRole('button', { name: 'Next' }) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
  }
  it.each(['Owner', 'Viewer'] as const)('checks real %s pages without inventing a diagnosis or correcting data', async role => {
    show(role); await launch('Why don’t these totals match?')
    fireEvent.change(screen.getByLabelText('Calendar year'), { target: { value: '2024' } })
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'Personal' } })
    await next(); await step(1); await next(); await step(2)
    const spendingLink = document.querySelector('[data-tutorial-id="annual-tour-transactions"]') as HTMLAnchorElement
    fireEvent.click(spendingLink); await step(3)
    expect(window.location.search).toContain('fromDate=2024-01-01')
    await next(); await step(4)
    fireEvent.change(document.querySelector('[data-tutorial-id="transaction-tour-description"]')!, { target: { value: 'Read-only comparison' } })
    expect((within(controls()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' })); await next(); await step(5)
    await next(); await step(6); await screen.findByRole('heading', { name: 'No imports yet' })
    fireEvent.change(document.querySelector('[data-tutorial-id="import-tour-status"]')!, { target: { value: 'completed' } })
    await next(); await step(7)
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' })); await next(); await step(8)
    fireEvent.click(screen.getByText('View details')); await next(); await step(9)
    expect(window.location.search).toContain('year=2024'); expect(window.location.search).toContain('scope=Personal')
    expect(within(controls()).getByText(/only if the evidence supports it/)).toBeTruthy()
    const finish = within(controls()).getByRole('button', { name: 'Continue checking this report' }) as HTMLButtonElement
    await waitFor(() => expect(finish.disabled).toBe(false)); fireEvent.click(finish)
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('check-spending-totals', 1, 'Completed', 9))
    for (const command of [updateTransaction, completeImport, saveImportDrafts, bulkReviewImportDrafts, discardImport]) expect(command).not.toHaveBeenCalled()
    expect(downloadTransactionsCsv).not.toHaveBeenCalled()
    expect(getImportDraftPage).not.toHaveBeenCalled()
  })
  it('does not call failed import metadata empty evidence and retries only the read', async () => {
    vi.mocked(getImports).mockRejectedValueOnce(new Error('Synthetic import read unavailable'))
    show(); await launch('Why don’t these totals match?'); await next(); await next()
    fireEvent.click(document.querySelector('[data-tutorial-id="annual-tour-transactions"]')!)
    await step(3); await next(); await next(); await next(); await step(6)
    await screen.findByRole('heading', { name: 'Could not load import list' })
    expect(screen.queryByRole('heading', { name: 'No imports yet' })).toBeNull()
    expect((within(controls()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await next(); await step(7); expect(completeImport).not.toHaveBeenCalled()
  })
})

describe('Change history read-only companion', () => {
  const activityGuide = () => screen.getByRole('region', { name: 'Review household activity tutorial controls' })
  const next = async () => {
    const button = within(activityGuide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
  }
  it.each([false, true])('uses permitted read filters/details/pages and completes with empty=%s', async empty => {
    if (empty) vi.mocked(getAuditEvents).mockResolvedValue({ items: [], page: 1, pageSize: 50, totalCount: 0, totalPages: 0,
      filters: { actors: [], actions: [], entityTypes: [] } })
    show('Viewer'); await launch('Review household activity'); await next(); await step(1)
    const from = screen.getByLabelText('From')
    expect(from.closest('[inert]')).toBeNull()
    fireEvent.change(from, { target: { value: '2026-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(getAuditEvents).toHaveBeenLastCalledWith('household-a', expect.objectContaining({ fromDate: '2026-01-01', page: 1 })))
    await next(); await step(2)
    if (!empty) {
      const details = screen.getByText('View details')
      expect(details.closest('[inert]')).toBeNull(); fireEvent.click(details)
      expect(details.closest('details')!.open).toBe(true)
    } else expect(screen.getByRole('heading', { name: 'No activity found' })).toBeTruthy()
    await next(); await step(3)
    if (!empty) {
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Activity pages' })).getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(getAuditEvents).toHaveBeenLastCalledWith('household-a', expect.objectContaining({ page: 2, fromDate: '2026-01-01' })))
    }
    await next(); await step(4)
    fireEvent.click(within(activityGuide()).getByRole('button', { name: 'Continue reviewing' }))
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('review-activity', 1, 'Completed', 4))
    expect(window.location.pathname).toBe('/activity')
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-01-01')
    expect(updateTransaction).not.toHaveBeenCalled()
  })
  it('exposes a failed load rather than claiming empty history, then permits a read-only retry', async () => {
    vi.mocked(getAuditEvents).mockRejectedValueOnce(new Error('Synthetic unavailable history'))
    show(); await launch('Review household activity')
    await screen.findByText('Needs attention')
    expect(screen.queryByRole('heading', { name: 'No activity found' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await next(); await step(1)
  })
})

describe('optional transaction export companion', () => {
  const exportGuide = () => screen.getByRole('region', { name: 'Export transaction data tutorial controls' })
  const next = async () => {
    const button = within(exportGuide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
  }
  async function toDownload() {
    show('Viewer'); await launch('Export transaction data')
    fireEvent.change(screen.getByLabelText('Description contains'), { target: { value: 'test only' } })
    expect((within(exportGuide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Export matching transactions' }).hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await next(); await step(1); await next(); await step(2); await next(); await step(3)
    expect(downloadTransactionsCsv).not.toHaveBeenCalled()
  }
  it.each([false, true])('downloads only after explicit consent, requested=%s', async requested => {
    vi.mocked(downloadTransactionsCsv).mockResolvedValue()
    await toDownload()
    if (requested) {
      const button = screen.getByRole('button', { name: 'Export matching transactions' })
      expect(button.closest('[inert]')).toBeNull(); fireEvent.click(button)
      await waitFor(() => expect(downloadTransactionsCsv).toHaveBeenCalledExactlyOnceWith('household-a', expect.objectContaining({ description: 'test only' })))
    }
    await next(); await step(4)
    fireEvent.click(within(exportGuide()).getByRole('button', { name: 'Return to tutorials' }))
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('export-transactions', 1, 'Completed', 4))
    expect(downloadTransactionsCsv).toHaveBeenCalledTimes(requested ? 1 : 0)
    expect(updateTransaction).not.toHaveBeenCalled()
  })
  it('waits for a pending download and recovers from failure without retrying it automatically', async () => {
    const download = deferred<void>()
    vi.mocked(downloadTransactionsCsv).mockReturnValueOnce(download.promise)
    await toDownload(); fireEvent.click(screen.getByRole('button', { name: 'Export matching transactions' }))
    await within(exportGuide()).findByText('Preparing your requested download…')
    expect((within(exportGuide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => download.reject(new Error('Synthetic download failure')))
    await screen.findByText('Needs attention')
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }))
    await next(); await step(4)
    expect(downloadTransactionsCsv).toHaveBeenCalledOnce()
  })
})
afterEach(restoreTutorialLayout)

describe('Annual Overview read-only companion', () => {
  it.each([
    ['Owner', 'Continue reviewing'], ['Viewer', 'Continue reviewing'], ['Owner', 'Return to tutorials'],
  ] as const)('guides %s through actual filters and drill-down, then %s without financial changes', async (role, destination) => {
    show(role); await launch()
    fireEvent.change(screen.getByLabelText('Calendar year'), { target: { value: '2024' } })
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'Personal' } })
    await waitFor(() => expect(getAnnualBudgetOverview).toHaveBeenLastCalledWith('household-a', 2024, 'Personal'))
    await click('Next'); await step(1)
    await click('Next'); await step(2)
    await click('Next'); await step(3)
    await click('Next'); await step(4)
    const link = document.querySelector<HTMLAnchorElement>('[data-tutorial-id="annual-tour-transactions"]')!
    expect(link.hasAttribute('inert')).toBe(false)
    fireEvent.click(link)
    await step(5)
    expect(window.location.pathname).toBe('/transactions')
    const query = new URLSearchParams(window.location.search)
    expect(query.get('currency')).toBe('CAD')
    expect(query.get('budgetInclusion')).toBe('Personal')
    expect(query.get('fromDate')).toBe('2024-01-01')
    await click('Next'); await step(6)
    expect(window.location.pathname).toBe('/budgeting/annual-overview')
    expect(new URLSearchParams(window.location.search).get('year')).toBe('2024')
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('Personal')
    await click(destination)
    expect(window.location.pathname).toBe(destination === 'Continue reviewing' ? '/budgeting/annual-overview' : '/tutorials')
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('annual-overview', 1, 'Completed', 6))
    expect(updateTransaction).not.toHaveBeenCalled(); expect(downloadTransactionsCsv).not.toHaveBeenCalled()
    expect(document.querySelector('[data-tutorial-inert]')).toBeNull()
  })

  it('blocks failed and pending reads, then recovers without inventing empty results', async () => {
    const pending = deferred<AnnualBudgetOverview>()
    vi.mocked(getAnnualBudgetOverview).mockReturnValueOnce(pending.promise)
    show(); await launch()
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => pending.reject(new Error('Synthetic failure')))
    await screen.findByText('Needs attention')
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    const retry = screen.getByRole('button', { name: 'Retry loading' })
    expect(retry.hasAttribute('inert')).toBe(false)
    fireEvent.click(retry)
    await click('Next'); await step(1)
  })

  it('invalidates a changed role, and Escape remains available', async () => {
    const view = show(); await launch(); await click('Next'); view.changeRole()
    await within(guide()).findByText(/Household or role changed/)
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.getByTestId('step').textContent).toBe('inactive')
  })

  it('does not call a stale read empty or valid', () => {
    expect(readTutorialGate('hh', 'Owner', null, { householdId: 'hh', path: '/report', url: '/report', ready: false }, '/report', '/report').canNext).toBe(false)
    expect(readTutorialGate('other', 'Owner', { householdId: 'hh', role: 'Owner' }, null, '/transactions', '/report', true).canNext).toBe(false)
  })
})
