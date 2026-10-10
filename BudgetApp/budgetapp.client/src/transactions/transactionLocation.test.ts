import { describe, expect, it } from 'vitest'
import { transactionLink } from '../budgets/transactionDrilldown'
import { buildTransactionQuery, createDefaultFilters, filterIntentKey, resolveFilterCategory } from './transactionFilters'
import { readTransactionLocation, transactionFilterLocation } from './transactionLocation'

const searchOf = (url: string) => new URL(url, 'https://example.test').search
describe('transaction URL filter interpretation', () => {
  it.each(['all', 'pastDays', 'specificDate', 'specificMonth', 'range'] as const)('round trips %s and every supported filter without changing API meaning', dateMode => {
    const filters = { ...createDefaultFilters(new Date(2024, 1, 29)), dateMode,
      accountId: 'unavailable-account', categoryType: 'Expense' as const, categoryId: 'parent', subcategoryId: 'child',
      description: 'Refund & groceries', budgetInclusion: 'PersonalAndHousehold', currency: 'CAD', spendingOnly: true }
    const query = buildTransactionQuery(filters, 3)
    const result = readTransactionLocation(searchOf(transactionFilterLocation(filters, 3, null, query)))
    expect(result.error).toBeNull()
    expect(result.query).toEqual(query)
    const resolved = resolveFilterCategory(result.filters, [{ id: 'parent', name: 'Parent', type: 'Expense', displayOrder: 0, isActive: true,
      children: [{ id: 'child', name: 'Child', type: 'Expense', displayOrder: 0, isActive: true, children: [] }] }])
    expect(filterIntentKey(resolved)).toBe(filterIntentKey(filters))
  })
  it('history keeps resolved rolling dates, while reapplying/saving retains rolling intent', () => {
    const filters = createDefaultFilters(new Date(2020, 0, 30))
    const query = buildTransactionQuery(filters, 1, new Date(2020, 0, 30))
    const restored = readTransactionLocation(searchOf(transactionFilterLocation(filters, 1, null, query)))
    expect(restored.query).toEqual(query)
    expect(restored.filters.dateMode).toBe('pastDays')
    expect(buildTransactionQuery(restored.filters, 1, new Date(2020, 1, 1))).toMatchObject({ fromDate: '2020-01-03', toDate: '2020-02-01' })
  })
  it('keeps original annual filters separately from applied filters and page number', () => {
    const original = readTransactionLocation(searchOf(transactionLink(2024, 'Personal', 'CAD', 'food', 2, 'household-a')))
    const changed = { ...original.filters, description: 'Refund', budgetInclusion: 'Household' }
    const restored = readTransactionLocation(searchOf(transactionFilterLocation(changed, 2, original.reportContext)))
    expect(restored.query).toMatchObject({ description: 'Refund', budgetInclusion: 'Household', page: 2 })
    expect(restored.reportContext).toEqual(original.reportContext)
    expect(restored.reportContext?.query.page).toBe(1)
  })
  it('retains unavailable references and uncategorized-only without broadening', () => {
    const result = readTransactionLocation('?accountId=removed&categoryId=removed-category&dateMode=all&budgetInclusion=NotIncluded')
    expect(result.query).toMatchObject({ accountId: 'removed', categoryId: 'removed-category', budgetInclusion: 'NotIncluded' })
    expect(readTransactionLocation('?uncategorizedOnly=true&dateMode=all').query).toMatchObject({ uncategorizedOnly: true, categoryId: undefined })
  })
  it.each(['?fromDate=bad&toDate=2024-01-01', '?fromDate=2024-01-01', '?dateMode=unsupported', '?page=-1',
    '?page=1.5', '?currency=Canadian', '?categoryType=Other', '?budgetInclusion=Other', '?dateMode=pastDays&pastDays=0',
    '?dateMode=pastDays&fromDate=bad&toDate=2024-01-01', '?dateMode=pastDays&toDate=2024-01-01'])('rejects invalid URL filters without an unrestricted query: %s', search => {
    const result = readTransactionLocation(search)
    expect(result.error).toBeTruthy()
    expect(result.query).toBeNull()
  })
  it('does not claim an invalid report source reconciles with current results', () => {
    const search = searchOf(transactionLink(2024, 'Personal', 'CAD', undefined, undefined, 'household-a'))
    expect(readTransactionLocation(`${search}&reportFilters=${encodeURIComponent('fromDate=bad')}`).reportContext).toBeNull()
  })
})
