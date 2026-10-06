import { describe, expect, it } from 'vitest'
import { transactionLink } from './transactionDrilldown'

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
})
