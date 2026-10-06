import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts } from '../accounts/accountApi'
import { getAnnualBudgetOverview, type AnnualBudgetOverview } from '../budgets/annualBudgetOverviewApi'
import { transactionLink } from '../budgets/transactionDrilldown'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { household, householdsFixture, otherHousehold } from '../test/fixtures'
import { downloadTransactionsCsv, getTransactions, updateTransaction, type TransactionItem } from '../transactions/transactionApi'
import { AnnualBudgetOverviewPage } from './AnnualBudgetOverviewPage'
import { TransactionManagementPage } from './TransactionManagementPage'

vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../budgets/annualBudgetOverviewApi', () => ({ getAnnualBudgetOverview: vi.fn() }))
vi.mock('../transactions/transactionApi', () => ({
  getTransactions: vi.fn(), downloadTransactionsCsv: vi.fn(), updateTransaction: vi.fn(), updateBudgetInclusion: vi.fn(),
}))

const categories: CategoryItem[] = [{ id: 'food', name: 'Food & Dining', type: 'Expense', displayOrder: 0,
  isActive: true, children: [{ id: 'groceries', name: 'Groceries', type: 'Expense', displayOrder: 0, isActive: false, children: [] }] }]
const overview: AnnualBudgetOverview = { year: 2024, scope: 'Personal', currency: 'CAD',
  actualAverageMonthCount: 12, budgetedMonthCount: 0, annualBudgetedAmount: 0, actualSpendingAmount: 1005,
  remainingAmount: null, incomeAmount: 2000, netCashFlowAmount: 995, uncategorizedSpendingAmount: 5,
  currencyMismatchTransactionCount: 1,
  months: [{ year: 2024, month: 2, budgetId: null, status: null, budgetedAmount: null,
    actualSpendingAmount: 1000, remainingAmount: null, incomeAmount: 2000, netCashFlowAmount: 1000 }],
  categories: [{ id: 'food', name: 'Food & Dining', isActive: true, budgetedAmount: null,
    actualAmount: 1000, remainingAmount: null, averageActualPerMonth: 1000 / 12, directActualAmount: 100,
    children: [{ id: 'groceries', name: 'Groceries', isActive: false, budgetedAmount: null,
      actualAmount: 900, remainingAmount: null, averageActualPerMonth: 75, directActualAmount: 900, children: [] }] }],
}
const row: TransactionItem = { id: 'transaction-a', accountId: 'account-a', accountName: 'Chequing',
  currency: 'CAD', categoryId: 'groceries', categoryName: 'Groceries', transactionDate: '2024-02-01',
  postedDate: null, amount: 10, description: 'Grocery purchase', merchantName: null, notes: null,
  source: 'Manual', reviewStatus: 'Approved', isExcludedFromBudget: false, isVoided: false, canEdit: true,
  includeInHouseholdBudget: true, includeInPersonalBudget: true, canEditHouseholdInclusion: true,
  updatedAtUtc: '2024-02-01T00:00:00Z' }

function Routes() {
  const { path } = useRouter()
  return path === '/annual-overview' ? <AnnualBudgetOverviewPage /> : <TransactionManagementPage />
}
function show(path = transactionLink(2024, 'Personal', 'CAD', undefined, undefined, household.id), value = householdsFixture()) {
  window.history.replaceState(null, '', path)
  return render(<RouterProvider><HouseholdContext.Provider value={value}>
    <Routes />
  </HouseholdContext.Provider></RouterProvider>)
}
async function loaded() {
  return await screen.findByRole('region', { name: 'Matching totals across all pages' })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTransactions).mockReset()
  vi.mocked(getAccounts).mockResolvedValue([])
  vi.mocked(getCategories).mockResolvedValue(categories)
  vi.mocked(getAnnualBudgetOverview).mockResolvedValue(overview)
  vi.mocked(getTransactions).mockImplementation(async (_householdId, query) => ({
    items: [{ ...row, id: query.page === 1 ? 'transaction-a' : 'transaction-b' }], hasMore: query.page === 1,
    page: query.page, pageSize: 100, totalCount: 101, totalPages: 2, totalsByCurrency: { CAD: 1005 },
  }))
  vi.mocked(downloadTransactionsCsv).mockResolvedValue()
  vi.mocked(updateTransaction).mockResolvedValue()
})

describe('annual report to transactions', () => {
  it('preserves context in every spending link and returns to the original year and scope', async () => {
    show('/annual-overview?year=2024&scope=Personal')
    const summary = await screen.findByRole('region', { name: 'Annual summary' })
    expect(getAnnualBudgetOverview).toHaveBeenCalledWith(household.id, 2024, 'Personal')
    const totalLink = within(summary).getByRole('link')
    const rootLink = screen.getByRole('link', { name: 'Food & Dining' })
    const childLink = screen.getByRole('link', { name: 'Groceries' })
    const monthLink = screen.getByRole('link', { name: 'Transactions' })
    const uncategorizedLink = screen.getByRole('link', { name: 'Review transactions' })
    for (const link of [totalLink, rootLink, childLink, monthLink, uncategorizedLink]) {
      const params = new URL((link as HTMLAnchorElement).href).searchParams
      expect(params.get('budgetInclusion')).toBe('Personal')
      expect(params.get('currency')).toBe('CAD')
      expect(params.get('spendingOnly')).toBe('true')
      expect(params.get('reportHouseholdId')).toBe(household.id)
    }
    expect(new URL((rootLink as HTMLAnchorElement).href).searchParams.get('categoryId')).toBe('food')
    expect(new URL((childLink as HTMLAnchorElement).href).searchParams.get('categoryId')).toBe('groceries')
    expect(new URL((monthLink as HTMLAnchorElement).href).searchParams.get('toDate')).toBe('2024-02-29')
    expect(new URL((uncategorizedLink as HTMLAnchorElement).href).searchParams.get('uncategorizedOnly')).toBe('true')
    fireEvent.click(totalLink)
    const totals = await loaded()
    expect(getTransactions).toHaveBeenLastCalledWith(household.id, expect.objectContaining({
      budgetInclusion: 'Personal', currency: 'CAD', spendingOnly: true, fromDate: '2024-01-01', toDate: '2024-12-31', page: 1,
    }))
    expect(totals.textContent).toContain('1,005.00')
    expect(totals.textContent).toContain('All 101 matching transactions')
    expect(screen.getByText('Annual overview drill-down')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Return to Annual overview' }))
    await screen.findByRole('region', { name: 'Annual summary' })
    expect(getAnnualBudgetOverview).toHaveBeenLastCalledWith(household.id, 2024, 'Personal')
    expect((screen.getByLabelText('Calendar year') as HTMLInputElement).value).toBe('2024')
  })

  it('keeps all-page totals and original report context across pagination and export', async () => {
    show()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeTruthy())
    const totals = await loaded()
    expect(totals.textContent).toContain('1,005.00')
    expect(totals.textContent).not.toContain('10.00')
    expect(screen.getByText('Annual overview drill-down')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Export matching transactions' }))
    expect(downloadTransactionsCsv).toHaveBeenCalledWith(household.id, expect.objectContaining({ page: 2, currency: 'CAD', budgetInclusion: 'Personal', spendingOnly: true }))
  })

  it('distinguishes pending and applied changes and can restore a child category without broadening it', async () => {
    show(transactionLink(2024, 'Personal', 'CAD', 'groceries', undefined, household.id))
    await loaded()
    await waitFor(() => expect((screen.getByLabelText('Subcategory') as HTMLSelectElement).value).toBe('groceries'))
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } })
    expect(screen.getByText(/Filter edits are not applied yet/)).toBeTruthy()
    expect(screen.getByText('Annual overview drill-down')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Export matching transactions' }))
    expect(downloadTransactionsCsv).toHaveBeenCalledWith(household.id, expect.objectContaining({ currency: 'CAD', categoryId: 'groceries' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await loaded()
    expect(screen.getByText(/View changed — no longer matches/)).toBeTruthy()
    expect(getTransactions).toHaveBeenLastCalledWith(household.id, expect.objectContaining({ currency: 'USD', categoryId: 'groceries' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore report filters' }))
    await loaded()
    expect(getTransactions).toHaveBeenLastCalledWith(household.id, expect.objectContaining({ currency: 'CAD', categoryId: 'groceries', page: 1 }))
    expect(screen.getByText('Annual overview drill-down')).toBeTruthy()
  })

  it('explains parent and uncategorized filters and never clears an unavailable category implicitly', async () => {
    vi.mocked(getCategories).mockResolvedValue([])
    show(transactionLink(2024, 'Household', 'CAD', 'missing-category', undefined, household.id))
    await loaded()
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('missing-category')
    expect(screen.getByRole('region', { name: 'Active report filters' }).textContent).toContain('including subcategories')
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await loaded()
    expect(getTransactions).toHaveBeenLastCalledWith(household.id, expect.objectContaining({ categoryId: 'missing-category' }))
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__uncategorized__' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await loaded()
    expect(getTransactions).toHaveBeenLastCalledWith(household.id, expect.objectContaining({ categoryId: undefined, uncategorizedOnly: true }))
    expect(screen.getByRole('region', { name: 'Active report filters' }).textContent).toContain('Uncategorized only')
  })

  it('guards report restoration and return navigation when a transaction edit is unsaved', async () => {
    show()
    await loaded()
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unsaved correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restore report filters' }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Unsaved correction')
    fireEvent.click(screen.getByRole('link', { name: 'Return to Annual overview' }))
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(window.location.pathname).toBe('/transactions')
  })

  it('does not claim that a different household still matches the originating report', async () => {
    show(undefined, { ...householdsFixture(), currentHousehold: otherHousehold })
    await loaded()
    expect(screen.getByText(/View changed — no longer matches/)).toBeTruthy()
    expect(screen.getByText(/Switch back to the original household/)).toBeTruthy()
    expect(screen.queryByText('Restore report filters')).toBeNull()
    expect(getTransactions).toHaveBeenLastCalledWith(otherHousehold.id, expect.anything())
  })

  it('hides unreliable totals on load failure and retries the retained filters', async () => {
    vi.mocked(getTransactions).mockRejectedValueOnce(new Error('Search unavailable'))
    show()
    await screen.findByText('Could not load matching transactions')
    expect(screen.queryByText('No matching transactions')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Matching totals across all pages' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }))
    await loaded()
    expect(getTransactions).toHaveBeenLastCalledWith(household.id, expect.objectContaining({ currency: 'CAD', budgetInclusion: 'Personal' }))
  })

  it('refreshes all-page totals after a financial correction without claiming a frozen report snapshot', async () => {
    show()
    await loaded()
    vi.mocked(getTransactions).mockResolvedValueOnce({ items: [{ ...row, amount: 20 }], hasMore: true,
      page: 1, pageSize: 100, totalCount: 101, totalPages: 2, totalsByCurrency: { CAD: 1015 } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Amount/ }), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Matching totals across all pages' }).textContent).toContain('1,015.00'))
    expect(updateTransaction).toHaveBeenCalledWith(household.id, row.id, expect.objectContaining({ amount: 20 }))
    expect(screen.getByText(/Totals use the latest saved transactions/)).toBeTruthy()
  })

  it('hides stale totals after a failed save refresh but preserves another row’s unsaved inclusion choices', async () => {
    vi.mocked(getTransactions).mockResolvedValueOnce({ items: [row, { ...row, id: 'transaction-b', description: 'Second purchase' }],
      hasMore: false, page: 1, pageSize: 100, totalCount: 2, totalPages: 1, totalsByCurrency: { CAD: 20 } })
    show()
    await loaded()
    fireEvent.click(screen.getAllByText('Include in budgets')[1])
    const secondEditor = screen.getByText('Second purchase', { selector: 'legend' }).closest('details')!
    fireEvent.click(within(secondEditor).getByLabelText('My personal budget'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Amount/ }), { target: { value: '20' } })
    vi.mocked(getTransactions).mockRejectedValueOnce(new Error('Refresh unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }))
    await screen.findByText(/Matching totals could not be refreshed after saving/)
    expect(screen.queryByRole('region', { name: 'Matching totals across all pages' })).toBeNull()
    expect((within(secondEditor).getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect((within(secondEditor).getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(false)
    expect(getTransactions).toHaveBeenCalledTimes(2)
  })

  it('renders a zero total for an empty report, and never combines different currencies', async () => {
    vi.mocked(getTransactions).mockResolvedValueOnce({ items: [], hasMore: false, page: 1, pageSize: 100, totalCount: 0, totalPages: 0, totalsByCurrency: {} })
    show()
    expect((await loaded()).textContent).toContain('0.00')
    expect(screen.getByText('No matching transactions')).toBeTruthy()
    vi.mocked(getTransactions).mockResolvedValueOnce({ items: [row], hasMore: false, page: 1, pageSize: 100, totalCount: 2, totalPages: 1, totalsByCurrency: { CAD: 10, USD: -20 } })
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    const totals = await loaded()
    expect(totals.textContent).toContain('CAD')
    expect(totals.textContent).toContain('10.00')
    expect(totals.textContent).toContain('USD')
    expect(totals.textContent).toContain('20.00')
    expect(screen.getByText(/View changed — no longer matches/)).toBeTruthy()
  })
})
