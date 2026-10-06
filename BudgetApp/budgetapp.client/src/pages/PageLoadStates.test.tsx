import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/apiClient'
import { getAnnualBudgetOverview, type AnnualBudgetOverview } from '../budgets/annualBudgetOverviewApi'
import { createBudget, deleteDraftBudget, getBudget, getBudgetMonthOptions, saveBudget } from '../budgets/budgetApi'
import { allocateYearlyPlan, getYearlyPlan, saveYearlyPlan } from '../budgets/yearlyPlanApi'
import { leaveHousehold } from '../households/householdApi'
import { createHouseholdInvitation, getHouseholdMembers, type HouseholdMemberManagement } from '../households/householdInvitationApi'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { annualFixture, budgetFixture, householdsFixture } from '../test/fixtures'
import { AnnualBudgetOverviewPage } from './AnnualBudgetOverviewPage'
import { BudgetManagementPage } from './BudgetManagementPage'
import { HouseholdManagementPage } from './HouseholdManagementPage'
import { YearlyPlanManagementPage } from './YearlyPlanManagementPage'

vi.mock('../budgets/annualBudgetOverviewApi', () => ({ getAnnualBudgetOverview: vi.fn() }))
vi.mock('../budgets/budgetApi', async original => ({ ...await original<typeof import('../budgets/budgetApi')>(),
  getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(), saveBudget: vi.fn(), createBudget: vi.fn(), deleteDraftBudget: vi.fn(),
}))
vi.mock('../budgets/yearlyPlanApi', async original => ({ ...await original<typeof import('../budgets/yearlyPlanApi')>(),
  getYearlyPlan: vi.fn(), saveYearlyPlan: vi.fn(), allocateYearlyPlan: vi.fn(), changeFiscalYearStartMonth: vi.fn(),
}))
vi.mock('../households/householdInvitationApi', async original => ({ ...await original<typeof import('../households/householdInvitationApi')>(),
  getHouseholdMembers: vi.fn(), createHouseholdInvitation: vi.fn(),
}))
vi.mock('../households/householdApi', async original => ({ ...await original<typeof import('../households/householdApi')>(), leaveHousehold: vi.fn() }))

const overview: AnnualBudgetOverview = { year: 2026, scope: 'Household', currency: 'CAD',
  actualAverageMonthCount: 10, budgetedMonthCount: 1, annualBudgetedAmount: 100,
  actualSpendingAmount: 75, remainingAmount: 25, incomeAmount: 200, netCashFlowAmount: 125,
  uncategorizedSpendingAmount: 0, currencyMismatchTransactionCount: 0, months: [],
  categories: [{ id: 'housing', name: 'Housing', isActive: true, budgetedAmount: 100,
    actualAmount: 75, directActualAmount: 75, remainingAmount: 25, averageActualPerMonth: 7.5, children: [] }],
}
const management: HouseholdMemberManagement = { canManageInvitations: true,
  members: [{ userId: 'member-a', displayName: 'Sample member', email: 'member@example.test',
    role: 'Owner', status: 'Active', joinedAtUtc: null }], invitations: [],
  exitOptions: { canLeave: true, canDeleteUnused: false, blockedReason: null },
}
function Routes({ children }: { children: ReactNode }) {
  const { path } = useRouter()
  return path === '/dashboard' ? <p>Dashboard destination</p> : children
}
function show(page: ReactNode, value = householdsFixture()) {
  window.history.replaceState(null, '', '/page-test?year=2026&month=1')
  return render(<RouterProvider><HouseholdContext.Provider value={value}>
    <Routes>{page}</Routes>
  </HouseholdContext.Provider></RouterProvider>)
}
const cases = [
  { name: 'annual overview', subject: 'annual overview', page: <AnnualBudgetOverviewPage />, read: getAnnualBudgetOverview,
    empty: () => vi.mocked(getAnnualBudgetOverview).mockResolvedValueOnce({ ...overview, budgetedMonthCount: 0,
      annualBudgetedAmount: 0, actualSpendingAmount: 0, remainingAmount: null, incomeAmount: 0, netCashFlowAmount: 0, categories: [] }),
    emptyText: 'No expense categories are available.', loaded: () => screen.getByRole('region', { name: 'Annual summary' }) },
  { name: 'annual targets', subject: 'annual targets', page: <YearlyPlanManagementPage />, read: getYearlyPlan,
    empty: () => vi.mocked(getYearlyPlan).mockResolvedValueOnce({ ...annualFixture(), id: null, categories: [] }),
    emptyText: 'No expense categories', loaded: () => screen.getByLabelText('Housing overall annual target') },
  { name: 'monthly budget', subject: 'budget', page: <BudgetManagementPage />, read: getBudget,
    empty: () => vi.mocked(getBudget).mockResolvedValueOnce({ ...budgetFixture(), id: null, status: null }),
    emptyText: 'No budget for January 2026', loaded: () => screen.getByLabelText('Housing budget') },
  { name: 'household', subject: 'household details', page: <HouseholdManagementPage />, read: getHouseholdMembers,
    empty: () => vi.mocked(getHouseholdMembers).mockResolvedValueOnce({ ...management, members: [] }),
    emptyText: 'No household members were found.', loaded: () => screen.getByText('Sample member') },
]

beforeEach(() => {
  vi.clearAllMocks()
  for (const read of [getAnnualBudgetOverview, getYearlyPlan, getBudget, getBudgetMonthOptions, getHouseholdMembers]) vi.mocked(read).mockReset()
  for (const write of [saveBudget, saveYearlyPlan, allocateYearlyPlan, createHouseholdInvitation, deleteDraftBudget, createBudget, leaveHousehold]) vi.mocked(write).mockReset()
  vi.mocked(getAnnualBudgetOverview).mockResolvedValue(overview)
  vi.mocked(getYearlyPlan).mockResolvedValue(annualFixture())
  vi.mocked(getBudget).mockResolvedValue(budgetFixture())
  vi.mocked(getBudgetMonthOptions).mockResolvedValue([])
  vi.mocked(getHouseholdMembers).mockResolvedValue(management)
  vi.mocked(saveBudget).mockResolvedValue(budgetFixture())
  vi.mocked(saveYearlyPlan).mockResolvedValue(annualFixture())
  vi.mocked(allocateYearlyPlan).mockResolvedValue({ createdCount: 12, replacedDraftCount: 0, skippedCount: 0, months: [] })
  vi.mocked(createHouseholdInvitation).mockResolvedValue({ emailDelivered: true, invitation: { id: 'invite-a',
    email: 'invited@example.test', role: 'Editor', status: 'Pending', createdAtUtc: '2026-01-01T00:00:00Z',
    lastSentAtUtc: '2026-01-01T00:00:00Z', expiresAtUtc: '2026-01-08T00:00:00Z' } })
  vi.mocked(deleteDraftBudget).mockResolvedValue()
  vi.mocked(leaveHousehold).mockResolvedValue()
})

describe('four-page read feedback', () => {
  it.each(cases)('$name: initial failures stop loading, do not claim absence, and recover through a read-only retry', async page => {
    vi.mocked(page.read).mockRejectedValueOnce(new Error('Sample load failure'))
    show(page.page)
    expect(screen.getByRole('status').textContent).toContain(`Loading ${page.subject}`)
    expect(screen.queryByText(page.emptyText)).toBeNull()
    await screen.findByRole('heading', { name: `Could not load ${page.subject}` })
    expect(screen.queryByText(page.emptyText)).toBeNull()
    expect(screen.queryByText(/^Loading /)).toBeNull()
    expect(screen.queryByText(/^Will create Draft$/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create blank budget' })).toBeNull()
    const defaults = screen.queryByRole('button', { name: 'Save default' }) as HTMLButtonElement | null
    if (defaults) expect(defaults.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('button', { name: 'Refresh data' })
    expect(page.loaded()).toBeTruthy()
    expect(page.read).toHaveBeenCalledTimes(2)
    expect(createBudget).not.toHaveBeenCalled()
    expect(createHouseholdInvitation).not.toHaveBeenCalled()
    expect(allocateYearlyPlan).not.toHaveBeenCalled()
  })

  it.each(cases)('$name: successful zero-record responses are empty, not failed or loading', async page => {
    page.empty()
    show(page.page)
    await screen.findByText(page.emptyText)
    expect(screen.queryByRole('button', { name: 'Retry loading' })).toBeNull()
    expect(screen.queryByText(/^Loading /)).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh data' })).toBeTruthy()
  })

  it.each(cases)('$name: a failed refresh labels retained data as stale and can retry without writes', async page => {
    show(page.page)
    await screen.findByRole('button', { name: 'Refresh data' })
    vi.mocked(page.read).mockRejectedValueOnce(new Error('Sample refresh failure'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    expect(screen.getByRole('status').textContent).toContain(`Refreshing ${page.subject}`)
    await screen.findByRole('heading', { name: `Could not refresh ${page.subject}` })
    expect(page.loaded()).toBeTruthy()
    expect(screen.getByText(/Previously loaded data is shown below/)).toBeTruthy()
    expect(screen.queryByText(page.emptyText)).toBeNull()
    if (page.name === 'annual targets' || page.name === 'monthly budget') expect((page.loaded() as HTMLInputElement).disabled).toBe(true)
    if (page.name === 'annual targets') expect(screen.queryByText(/^Will create Draft$/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('button', { name: 'Refresh data' })
    expect(page.read).toHaveBeenCalledTimes(3)
    expect(saveBudget).not.toHaveBeenCalled()
    expect(saveYearlyPlan).not.toHaveBeenCalled()
    expect(createHouseholdInvitation).not.toHaveBeenCalled()
  })

  it.each(cases)('$name: access revocation hides previously loaded records rather than displaying stale protected data', async page => {
    show(page.page)
    await screen.findByRole('button', { name: 'Refresh data' })
    vi.mocked(page.read).mockRejectedValueOnce(new ApiError('Access revoked', 403))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByRole('heading', { name: `Could not load ${page.subject}` })
    expect(screen.queryByText(/Previously loaded data is shown below/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Annual summary' })).toBeNull()
    expect(screen.queryByLabelText('Housing budget')).toBeNull()
    expect(screen.queryByLabelText('Housing overall annual target')).toBeNull()
    expect(screen.queryByText('Sample member')).toBeNull()
    expect(screen.queryByText(page.emptyText)).toBeNull()
  })
})

describe('safe recovery around edits and writes', () => {
  it.each([
    { page: <BudgetManagementPage />, label: 'Housing budget', save: 'Save budget', write: saveBudget },
    { page: <YearlyPlanManagementPage />, label: 'Housing overall annual target', save: 'Save annual targets', write: saveYearlyPlan },
  ])('$label: failed saves preserve edits and refreshing requires approval before replacing them', async entry => {
    show(entry.page)
    const input = await screen.findByLabelText(entry.label)
    fireEvent.change(input, { target: { value: '250' } })
    vi.mocked(entry.write).mockRejectedValueOnce(new Error('Sample save failure'))
    fireEvent.click(screen.getByRole('button', { name: entry.save }))
    await screen.findByText('Sample save failure')
    expect((input as HTMLInputElement).value).toBe('250')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect((input as HTMLInputElement).value).toBe('250')
    expect(entry.write).toHaveBeenCalledTimes(1)
  })

  it('a failed invitation save retains email and role, including across a failed read refresh', async () => {
    show(<HouseholdManagementPage />)
    const email = await screen.findByLabelText('Email')
    fireEvent.change(email, { target: { value: 'invited@example.test' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Viewer' } })
    vi.mocked(createHouseholdInvitation).mockRejectedValueOnce(new Error('Sample invitation failure'))
    fireEvent.submit(email.closest('form')!)
    await screen.findByText('Sample invitation failure')
    vi.mocked(getHouseholdMembers).mockRejectedValueOnce(new Error('Sample refresh failure'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('Could not refresh household details')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('invited@example.test')
    expect((screen.getByLabelText('Role') as HTMLSelectElement).value).toBe('Viewer')
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('button', { name: 'Refresh data' })
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('invited@example.test')
    expect(createHouseholdInvitation).toHaveBeenCalledTimes(1)
  })

  it('a saved invitation followed by a failed refresh is not sent again on Retry', async () => {
    show(<HouseholdManagementPage />)
    const email = await screen.findByLabelText('Email')
    fireEvent.change(email, { target: { value: 'invited@example.test' } })
    vi.mocked(getHouseholdMembers).mockRejectedValueOnce(new Error('Read failed after save'))
    fireEvent.submit(email.closest('form')!)
    await screen.findByText('Could not refresh household details')
    expect(screen.getByText('Household invitations were updated.')).toBeTruthy()
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('button', { name: 'Refresh data' })
    expect(createHouseholdInvitation).toHaveBeenCalledTimes(1)
  })

  it('allocation success followed by unavailable budget statuses keeps its success notice and never reallocates on Retry', async () => {
    show(<YearlyPlanManagementPage />)
    await screen.findByLabelText('Housing overall annual target')
    vi.mocked(window.confirm).mockReturnValue(true)
    vi.mocked(getBudgetMonthOptions).mockRejectedValueOnce(new Error('Read failed after allocation'))
    fireEvent.click(screen.getByRole('button', { name: 'Create selected drafts' }))
    await screen.findByText('Could not refresh annual targets')
    expect(screen.getByText('12 created, 0 draft replaced, and 0 skipped.')).toBeTruthy()
    expect(screen.queryByText(/^Will create Draft$/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('button', { name: 'Refresh data' })
    expect(allocateYearlyPlan).toHaveBeenCalledTimes(1)
  })

  it('unknown existing budgets block draft previews, even if the annual plan read succeeds', async () => {
    vi.mocked(getBudgetMonthOptions).mockRejectedValueOnce(new Error('Existing budgets unavailable'))
    show(<YearlyPlanManagementPage />)
    await screen.findByText('Could not load annual targets')
    expect(screen.queryByText(/^Will create Draft$/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create selected drafts' })).toBeNull()
    expect(allocateYearlyPlan).not.toHaveBeenCalled()
  })

  it('a previously empty month does not offer creation after a failed refresh', async () => {
    vi.mocked(getBudget).mockResolvedValueOnce({ ...budgetFixture(), id: null, status: null })
    show(<BudgetManagementPage />)
    await screen.findByRole('button', { name: 'Create blank budget' })
    vi.mocked(getBudget).mockRejectedValueOnce(new Error('The month status is unknown'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('Could not refresh budget')
    expect(screen.queryByText('No budget for January 2026')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create blank budget' })).toBeNull()
    expect(screen.getByText(/Its current status is unavailable/)).toBeTruthy()
  })

  it('confirmed draft deletion followed by a read failure does not claim the month is empty or repeat deletion', async () => {
    show(<BudgetManagementPage />)
    await screen.findByLabelText('Housing budget')
    vi.mocked(window.confirm).mockReturnValue(true)
    vi.mocked(getBudget).mockRejectedValueOnce(new Error('Read failed after deletion'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    await screen.findByText('Could not load budget')
    expect(screen.getByText(/Draft budget deleted/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create blank budget' })).toBeNull()
    vi.mocked(getBudget).mockResolvedValueOnce({ ...budgetFixture(), id: null, status: null })
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByText('No budget for January 2026')
    expect(deleteDraftBudget).toHaveBeenCalledTimes(1)
  })

  it('leaving a household is not repeated when only the membership-list refresh failed', async () => {
    const value = householdsFixture()
    vi.mocked(value.refresh).mockRejectedValueOnce(new Error('Membership list unavailable'))
    show(<HouseholdManagementPage />, value)
    await screen.findByRole('button', { name: 'Leave household' })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }))
    await screen.findByText(/Household change saved, but your household list could not be refreshed/)
    expect(screen.queryByRole('button', { name: 'Leave household' })).toBeNull()
    expect(screen.queryByText('Sample member')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry household list' }))
    await screen.findByText('Dashboard destination')
    expect(leaveHousehold).toHaveBeenCalledTimes(1)
    expect(value.refresh).toHaveBeenCalledTimes(2)
  })

  it('a late response from another month cannot replace the current budget', async () => {
    let resolveOld!: (value: ReturnType<typeof budgetFixture>) => void
    vi.mocked(getBudget).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    vi.mocked(getBudget).mockResolvedValueOnce({ ...budgetFixture(), month: 2,
      categories: [{ ...budgetFixture().categories[0], name: 'Current month category' }] })
    show(<BudgetManagementPage />)
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2' } })
    await screen.findByLabelText('Current month category budget')
    await act(async () => { resolveOld(budgetFixture()) })
    expect(screen.queryByLabelText('Housing budget')).toBeNull()
    expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('2')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh data' })).toBeTruthy())
  })
})
