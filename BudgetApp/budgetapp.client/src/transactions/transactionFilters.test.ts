import { describe, expect, it } from 'vitest'
import { buildTransactionQuery, createDefaultFilters, filterIntentKey, storedFilterIntent } from './transactionFilters'

describe('shared transaction filter intent', () => {
  it('keeps a rolling period rolling instead of persisting today’s resolved dates', () => {
    const filters = storedFilterIntent(createDefaultFilters(new Date(2026, 0, 30)))
    expect(filters.dateMode).toBe('pastDays')
    expect(filters.pastDays).toBe('30')
    expect(filters.fromDate).toBe('')
    expect(buildTransactionQuery(filters, 1, new Date(2026, 0, 30))).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-01-30' })
    expect(buildTransactionQuery(filters, 1, new Date(2026, 1, 1))).toMatchObject({ fromDate: '2026-01-03', toDate: '2026-02-01' })
  })
  it.each([['2024-02', '2024-02-29'], ['0004-02', '0004-02-29'], ['9999-12', '9999-12-31']])('keeps a fixed month %s, including leap years and small years', (month, end) => {
    const filters = { ...createDefaultFilters(), dateMode: 'specificMonth' as const, specificMonth: month }
    expect(buildTransactionQuery(storedFilterIntent(filters), 1)).toMatchObject({ fromDate: `${month}-01`, toDate: end })
  })
  it('stores every supported search choice but no page or annual-report origin', () => {
    const filters = { ...createDefaultFilters(), accountId: 'a', categoryType: 'Expense' as const,
      categoryId: 'root', subcategoryId: 'child', description: ' rent ', budgetInclusion: 'PersonalAndHousehold',
      currency: 'CAD', spendingOnly: true, dateMode: 'range' as const, fromDate: '2026-02-01', toDate: '2026-03-01' }
    expect(buildTransactionQuery(storedFilterIntent(filters), 1)).toEqual({ accountId: 'a', categoryType: 'Expense',
      categoryId: 'child', uncategorizedOnly: undefined, description: 'rent', budgetInclusion: 'PersonalAndHousehold',
      currency: 'CAD', spendingOnly: true, page: 1, fromDate: '2026-02-01', toDate: '2026-03-01' })
    expect(Object.keys(storedFilterIntent(filters))).not.toContain('page')
    expect(Object.keys(storedFilterIntent(filters))).not.toContain('report')
  })
  it('distinguishes fixed versus rolling dates even if they currently match', () => {
    const rolling = createDefaultFilters(new Date(2026, 0, 30))
    const fixed = { ...rolling, dateMode: 'range' as const }
    expect(filterIntentKey(rolling)).not.toBe(filterIntentKey(fixed))
    expect(filterIntentKey({ ...rolling, specificDate: '2020-01-01' })).toBe(filterIntentKey(rolling))
    const { accountId, ...rest } = rolling
    expect(filterIntentKey({ ...rest, accountId })).toBe(filterIntentKey(rolling))
  })
  it.each(['2026-02-30', '2026-13-01', '0000-01-01', 'not-a-date'])('rejects malformed dates: %s', date => {
    expect(() => buildTransactionQuery({ ...createDefaultFilters(), dateMode: 'specificDate', specificDate: date }, 1)).toThrow()
  })
})
