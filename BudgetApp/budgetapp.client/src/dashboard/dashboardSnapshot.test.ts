import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '../api/apiClient'
import { dashboardBudgetLink, dashboardPeriod, dashboardQuery, dashboardTransactionsLink, readDashboardSnapshot } from './dashboardSnapshot'
import { defaultDashboardPanelKeys, dashboardPanels } from '../routing/pageRegistry'

vi.mock('../api/apiClient', () => ({ apiGet: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
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
  it('preserves scope, month, currency and uncategorized filters in drill-downs', () => {
    const link = new URL(dashboardTransactionsLink('2026-01', 'Personal', 'USD', true), 'http://localhost')
    expect(Object.fromEntries(link.searchParams)).toEqual({ fromDate: '2026-01-01', toDate: '2026-01-31', budgetInclusion: 'Personal', currency: 'USD', spendingOnly: 'true', uncategorizedOnly: 'true' })
    expect(dashboardBudgetLink('2026-01', 'Personal')).toBe('/budgeting?year=2026&month=1&scope=Personal')
  })
  it('makes one focused request and does not request recent rows by default', async () => {
    const data = { budget: { currency: 'USD', scope: 'Personal' }, recent: null, hasVisibleTransactions: true }
    vi.mocked(apiGet).mockResolvedValue(data)
    expect(await readDashboardSnapshot('household-a', '2026-01', 'Personal')).toBe(data)
    expect(apiGet).toHaveBeenCalledExactlyOnceWith('/api/households/household-a/dashboard-summary?year=2026&month=1&scope=Personal')
  })
  it('requests recent records explicitly, without inventing another filter context', async () => {
    await readDashboardSnapshot('household-a', '2026-01', 'Household', true)
    expect(apiGet).toHaveBeenCalledExactlyOnceWith('/api/households/household-a/dashboard-summary?year=2026&month=1&scope=Household&includeRecent=true')
  })
  it('encodes the household path and propagates a read failure rather than returning empty data', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('Summary failed'))
    await expect(readDashboardSnapshot('household/other', '2026-01', 'Personal')).rejects.toThrow('Summary failed')
    expect(apiGet).toHaveBeenCalledExactlyOnceWith('/api/households/household%2Fother/dashboard-summary?year=2026&month=1&scope=Personal')
  })
  it('defaults to three mixed cards while retaining all existing shortcuts for saved layouts', () => {
    expect(defaultDashboardPanelKeys).toEqual(['financial-overview', 'needs-attention', 'quick-actions'])
    for (const key of ['monthly-budget', 'transactions', 'accounts', 'import-review', 'household', 'categories']) expect(dashboardPanels.some(panel => panel.key === key)).toBe(true)
  })
})
