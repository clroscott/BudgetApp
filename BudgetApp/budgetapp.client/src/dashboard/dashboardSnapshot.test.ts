import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts } from '../accounts/accountApi'
import { getBudget } from '../budgets/budgetApi'
import { getImports } from '../imports/importApi'
import { getTransactions } from '../transactions/transactionApi'
import { budgetFixture } from '../test/fixtures'
import { budgetSnapshotTotals, dashboardBudgetLink, dashboardPeriod, dashboardQuery, dashboardTransactionsLink, readDashboardSnapshot } from './dashboardSnapshot'
import { defaultDashboardPanelKeys, dashboardPanels } from '../routing/pageRegistry'

vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../budgets/budgetApi', () => ({ getBudget: vi.fn() }))
vi.mock('../imports/importApi', () => ({ getImports: vi.fn() }))
vi.mock('../transactions/transactionApi', () => ({ getTransactions: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAccounts).mockResolvedValue([])
  vi.mocked(getImports).mockResolvedValue([])
  vi.mocked(getTransactions).mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0, hasMore: false, totalsByCurrency: {} })
})
describe('dashboard financial context', () => {
  it('uses the household time zone at a month boundary', () => {
    const now = new Date('2026-02-01T02:00:00Z')
    expect(dashboardPeriod('America/Vancouver', now)).toBe('2026-01')
    expect(dashboardPeriod('UTC', now)).toBe('2026-02')
  })
  it('uses a safe UTC initial month when a browser cannot resolve a legacy zone', () => {
    expect(dashboardPeriod('Unsupported/Legacy', new Date('2026-02-01T02:00:00Z'))).toBe('2026-02')
  })
  it.each([['2028-02', '2028-02-29'], ['2026-02', '2026-02-28'], ['0001-02', '0001-02-28']])('keeps the full month for %s', (period, end) => {
    expect(dashboardQuery(period, 'Personal', 'CAD')).toEqual({ page: 1, fromDate: `${period}-01`, toDate: end, budgetInclusion: 'Personal', currency: 'CAD', spendingOnly: true })
  })
  it('keeps parent and child amounts from being counted twice and matches monthly-budget totals', () => {
    const data = budgetFixture()
    const root = data.categories[0]
    root.actualAmount = 120
    root.children = [{ ...root, id: 'rent', children: [], budgetedAmount: 60, actualAmount: 80 }, { ...root, id: 'utilities', children: [], budgetedAmount: 40, actualAmount: 40 }]
    data.uncategorizedActualAmount = 20
    expect(budgetSnapshotTotals(data)).toEqual({ budgeted: 100, actual: 120, remaining: -20 })
  })
  it('distinguishes an explicit budgeted zero from no saved budget in the data', () => {
    const data = budgetFixture(); data.categories[0].budgetedAmount = 0
    expect(budgetSnapshotTotals(data).budgeted).toBe(0)
    expect(data.id).not.toBeNull()
  })
  it('preserves scope, month, currency and uncategorized filters in drill-downs', () => {
    const link = new URL(dashboardTransactionsLink('2026-01', 'Personal', 'USD', true), 'http://localhost')
    expect(Object.fromEntries(link.searchParams)).toEqual({ fromDate: '2026-01-01', toDate: '2026-01-31', budgetInclusion: 'Personal', currency: 'USD', spendingOnly: 'true', uncategorizedOnly: 'true' })
    expect(dashboardBudgetLink('2026-01', 'Personal')).toBe('/budgeting?year=2026&month=1&scope=Personal')
  })
  it('reuses visibility-filtered APIs and the loaded budget currency, without combining scopes or currencies', async () => {
    vi.mocked(getBudget).mockResolvedValue({ ...budgetFixture(), currency: 'USD', scope: 'Personal' })
    const result = await readDashboardSnapshot('household-a', '2026-01', 'Personal')
    expect(getBudget).toHaveBeenCalledExactlyOnceWith('household-a', 2026, 1, 'Personal')
    expect(getAccounts).toHaveBeenCalledExactlyOnceWith('household-a')
    expect(getImports).toHaveBeenCalledExactlyOnceWith('household-a')
    expect(getTransactions).toHaveBeenNthCalledWith(1, 'household-a', { page: 1 })
    expect(getTransactions).toHaveBeenNthCalledWith(2, 'household-a', { ...dashboardQuery('2026-01', 'Personal', 'USD'), uncategorizedOnly: true })
    expect(result.budget.currency).toBe('USD')
  })
  it('defaults to three mixed cards while retaining all existing shortcuts for saved layouts', () => {
    expect(defaultDashboardPanelKeys).toEqual(['financial-overview', 'needs-attention', 'quick-actions'])
    for (const key of ['monthly-budget', 'transactions', 'accounts', 'import-review', 'household', 'categories']) expect(dashboardPanels.some(panel => panel.key === key)).toBe(true)
  })
})
