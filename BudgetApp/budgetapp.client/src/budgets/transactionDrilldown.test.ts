import { describe, expect, it } from 'vitest'
import { annualOverviewSelection, transactionLink } from './transactionDrilldown'

describe('annual budget transaction links', () => {
  it('preserves scope, currency, category and spending semantics', () => {
    const link = new URL(transactionLink(2026, 'Personal', 'CAD', 'housing/unsafe?query'), 'https://example.test')
    expect(link.pathname).toBe('/transactions')
    expect(Object.fromEntries(link.searchParams)).toEqual({ budgetInclusion: 'Personal', currency: 'CAD',
      spendingOnly: 'true', fromDate: '2026-01-01', toDate: '2026-12-31', categoryId: 'housing/unsafe?query' })
  })
  it('uses the exact selected month including leap years', () => {
    const link = new URL(transactionLink(2028, 'Household', 'USD', undefined, 2), 'https://example.test')
    expect(link.searchParams.get('fromDate')).toBe('2028-02-01')
    expect(link.searchParams.get('toDate')).toBe('2028-02-29')
    expect(link.searchParams.get('budgetInclusion')).toBe('Household')
  })
  it('formats early years without the Date constructor’s 1900 offset', () => {
    const link = new URL(transactionLink(1, 'Household', 'CAD', undefined, 2), 'https://example.test')
    expect(link.searchParams.get('fromDate')).toBe('0001-02-01')
    expect(link.searchParams.get('toDate')).toBe('0001-02-28')
  })
  it('records the originating household and year without putting a financial amount in the URL', () => {
    const link = new URL(transactionLink(2026, 'Personal', 'CAD', undefined, 7, 'household-a'), 'https://example.test')
    expect(link.searchParams.get('report')).toBe('annual-overview')
    expect(link.searchParams.get('reportYear')).toBe('2026')
    expect(link.searchParams.get('reportHouseholdId')).toBe('household-a')
    expect(link.searchParams.has('amount')).toBe(false)
  })
  it('restores the selected report year and scope and ignores invalid selection values', () => {
    expect(annualOverviewSelection('?year=2024&scope=Personal')).toEqual({ year: 2024, scope: 'Personal' })
    expect(annualOverviewSelection('?year=0&scope=Other')).toEqual({ year: new Date().getFullYear(), scope: 'Household' })
    expect(annualOverviewSelection('?year=99999')).toEqual({ year: new Date().getFullYear(), scope: 'Household' })
  })
})
