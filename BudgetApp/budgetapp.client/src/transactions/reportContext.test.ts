import { describe, expect, it } from 'vitest'
import { transactionLink } from '../budgets/transactionDrilldown'
import { annualReportReturnLink, readAnnualReportContext, transactionFilterKey } from './reportContext'
import type { TransactionQuery } from './transactionApi'

const query: TransactionQuery = { page: 1, fromDate: '2026-01-01', toDate: '2026-12-31',
  budgetInclusion: 'Personal', currency: 'CAD', spendingOnly: true, categoryId: 'food' }
const search = new URL(transactionLink(2026, 'Personal', 'CAD', 'food', undefined, 'household-a'), 'https://example.test').search

describe('annual drill-down context', () => {
  it('keeps the origin and filter snapshot, ignoring page changes only', () => {
    expect(readAnnualReportContext(search, query)).toEqual({ year: 2026, scope: 'Personal', householdId: 'household-a', query })
    expect(transactionFilterKey({ ...query, page: 2 })).toBe(transactionFilterKey(query))
  })
  it.each([
    { accountId: 'other' }, { fromDate: '2026-02-01' }, { toDate: '2026-06-30' },
    { categoryType: 'Income' }, { categoryId: 'groceries' }, { uncategorizedOnly: true },
    { description: 'rent' }, { budgetInclusion: 'Household' }, { currency: 'USD' }, { spendingOnly: false },
  ])('detects an intentional filter change: %j', changes => {
    expect(transactionFilterKey({ ...query, ...changes })).not.toBe(transactionFilterKey(query))
  })
  it('does not treat incomplete or inconsistent URLs as a report drill-down', () => {
    expect(readAnnualReportContext('', query)).toBeNull()
    expect(readAnnualReportContext(search.replace('reportYear=2026', 'reportYear=2025'), query)).toBeNull()
    expect(readAnnualReportContext(search, { ...query, budgetInclusion: 'NotIncluded' })).toBeNull()
    expect(readAnnualReportContext(search, { ...query, spendingOnly: false })).toBeNull()
    expect(readAnnualReportContext(search, { ...query, currency: undefined })).toBeNull()
  })
  it('returns to the same report selection without unsafe URL concatenation', () => {
    expect(annualReportReturnLink(2026, 'Personal')).toBe('/annual-overview?year=2026&scope=Personal')
  })
})
