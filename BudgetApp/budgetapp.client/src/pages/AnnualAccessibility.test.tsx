import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAnnualBudgetOverview, type AnnualBudgetCategory, type AnnualBudgetOverview } from '../budgets/annualBudgetOverviewApi'
import { getBudgetMonthOptions } from '../budgets/budgetApi'
import { getYearlyPlan } from '../budgets/yearlyPlanApi'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { annualFixture, household, householdsFixture } from '../test/fixtures'
import { AnnualBudgetOverviewPage } from './AnnualBudgetOverviewPage'
import { YearlyPlanManagementPage } from './YearlyPlanManagementPage'

vi.mock('../budgets/annualBudgetOverviewApi', () => ({ getAnnualBudgetOverview: vi.fn() }))
vi.mock('../budgets/budgetApi', async original => ({ ...await original<typeof import('../budgets/budgetApi')>(), getBudgetMonthOptions: vi.fn() }))
vi.mock('../budgets/yearlyPlanApi', async original => ({ ...await original<typeof import('../budgets/yearlyPlanApi')>(),
  getYearlyPlan: vi.fn(), changeFiscalYearStartMonth: vi.fn(), saveYearlyPlan: vi.fn(), allocateYearlyPlan: vi.fn(),
}))

function category(id: string, name: string, changes: Partial<AnnualBudgetCategory> = {}): AnnualBudgetCategory {
  return { id, name, isActive: true, budgetedAmount: 1200, actualAmount: 1300, remainingAmount: -100,
    averageActualPerMonth: 130, directActualAmount: 1300, children: [], ...changes }
}
function report(): AnnualBudgetOverview {
  return { year: 2026, scope: 'Household', currency: 'CAD', actualAverageMonthCount: 10,
    budgetedMonthCount: 10, annualBudgetedAmount: 1200, actualSpendingAmount: 1300, remainingAmount: -100,
    incomeAmount: 2000, netCashFlowAmount: 700, uncategorizedSpendingAmount: 0, currencyMismatchTransactionCount: 0,
    months: [], categories: [category('housing', 'Housing', { children: [
      category('rent', 'Rent', { budgetedAmount: 0, actualAmount: 25, remainingAmount: -25, averageActualPerMonth: 2.5 }),
      category('repairs', 'Repairs', { isActive: false, budgetedAmount: null, remainingAmount: null,
        actualAmount: -20, averageActualPerMonth: -2 }),
    ] }), category('food', 'Food & Dining', { children: [category('groceries', 'Groceries')] })] }
}
function show(targets = false, role = household.role) {
  window.history.replaceState(null, '', targets ? '/budgeting/annual-targets' : '/budgeting/annual-overview?year=2026')
  const context = householdsFixture()
  context.currentHousehold = { ...household, role }
  return render(<RouterProvider><HouseholdContext.Provider value={context}>
    {targets ? <YearlyPlanManagementPage /> : <AnnualBudgetOverviewPage />}
  </HouseholdContext.Provider></RouterProvider>)
}
const money = (value: number, currency = 'CAD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
function categoryRow(table: HTMLElement, name: string) {
  return within(table).getByRole('link', { name }).closest('tr')!
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAnnualBudgetOverview).mockResolvedValue(report())
  vi.mocked(getYearlyPlan).mockResolvedValue(annualFixture())
  vi.mocked(getBudgetMonthOptions).mockResolvedValue([])
})

describe('annual report semantics', () => {
  it('exposes a named native table with visible column/row headers and every amount associated with both', async () => {
    show()
    const table = await screen.findByRole('table', { name: 'Household category performance — 2026, CAD' })
    expect(table.tagName).toBe('TABLE')
    const columns = within(table).getAllByRole('columnheader')
    expect(columns.map(column => column.textContent)).toEqual(['Category', 'Budgeted', 'Actual', 'Remaining', 'Average actual per month'])
    for (const column of columns) {
      expect(column.getAttribute('scope')).toBe('col')
      expect(column.closest('[aria-hidden="true"]')).toBeNull()
    }
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    for (const row of rows) {
      const rowHeader = within(row).getByRole('rowheader')
      expect(rowHeader.getAttribute('scope')).toBe('row')
      const cells = within(row).getAllByRole('cell')
      expect(cells).toHaveLength(4)
      cells.forEach((cell, index) => {
        const headers = cell.getAttribute('headers')!.split(' ').map(id => document.getElementById(id))
        expect(headers).toEqual([rowHeader, columns[index + 1]])
        expect(cell.closest('[aria-hidden="true"]')).toBeNull()
      })
    }
    const ids = [...table.querySelectorAll('[id]')].map(element => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('states hierarchy and deactivation in text, with each root and its children kept in a native row group', async () => {
    show()
    const table = await screen.findByRole('table')
    const rent = categoryRow(table, 'Rent')
    expect(within(rent).getByRole('rowheader').textContent).toContain('Subcategory of Housing')
    expect(within(categoryRow(table, 'Repairs')).getByRole('rowheader').textContent).toContain('Deactivated')
    expect(categoryRow(table, 'Housing').parentElement?.tagName).toBe('TBODY')
    expect(categoryRow(table, 'Housing').parentElement).toBe(rent.parentElement)
    expect(categoryRow(table, 'Groceries').parentElement).not.toBe(rent.parentElement)
    expect(within(categoryRow(table, 'Housing')).getByRole('rowheader').textContent).toContain('Includes subcategories')
  })

  it('distinguishes no budget from zero and explains negative remaining/actual figures without relying on color', async () => {
    show()
    const table = await screen.findByRole('table')
    const rent = within(categoryRow(table, 'Rent')).getAllByRole('cell')
    expect(rent[0].textContent).toBe(`${money(0)}Zero budget`)
    expect(rent[2].textContent).toBe(`${money(-25)}Over budget`)
    const repairs = within(categoryRow(table, 'Repairs')).getAllByRole('cell')
    expect(repairs[0].textContent).toBe('No budget')
    expect(repairs[2].textContent).toBe('Not available — no budget')
    expect(repairs[1].textContent).toBe(`${money(-20)}Negative amount`)
    expect(repairs[3].textContent).toBe(`${money(-2)}Negative amount`)
  })

  it.each(['Household', 'Personal'] as const)('preserves category drill-down filters and all server figures in %s scope', async scope => {
    const data = report()
    data.scope = scope
    data.currency = 'USD'
    const snapshot = JSON.stringify(data)
    vi.mocked(getAnnualBudgetOverview).mockResolvedValue(data)
    show()
    if (scope === 'Personal') fireEvent.change(screen.getByLabelText('Scope'), { target: { value: scope } })
    const table = await screen.findByRole('table', { name: `${scope} category performance — 2026, USD` })
    const cells = within(categoryRow(table, 'Housing')).getAllByRole('cell')
    expect(cells.map(cell => cell.querySelector('strong')!.textContent)).toEqual([1200, 1300, -100, 130].map(value => money(value, 'USD')))
    for (const [name, id] of [['Housing', 'housing'], ['Rent', 'rent']]) {
      const url = new URL((within(table).getByRole('link', { name }) as HTMLAnchorElement).href)
      expect(url.pathname).toBe('/transactions')
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ categoryId: id, budgetInclusion: scope,
        currency: 'USD', spendingOnly: 'true', fromDate: '2026-01-01', toDate: '2026-12-31',
        report: 'annual-overview', reportYear: '2026', reportHouseholdId: 'household-a' })
    }
    expect(JSON.stringify(data)).toBe(snapshot)
  })

  it('provides a named keyboard-focusable scrolling region without making individual numeric cells Tab stops', async () => {
    show()
    const table = await screen.findByRole('table')
    const region = screen.getByRole('region', { name: 'Category performance table' })
    expect(region.contains(table)).toBe(true)
    expect(region.tabIndex).toBe(0)
    const help = document.getElementById(region.getAttribute('aria-describedby')!)!
    expect(help.textContent).toContain('arrow keys')
    region.focus()
    expect(document.activeElement).toBe(region)
    const link = within(table).getByRole('link', { name: 'Rent' })
    link.focus()
    expect(document.activeElement).toBe(link)
    expect(within(table).getAllByRole('cell').every(cell => cell.tabIndex === -1)).toBe(true)
  })

  it('retains clear empty-category and future-year average explanations', async () => {
    vi.mocked(getAnnualBudgetOverview).mockResolvedValue({ ...report(), categories: [], actualAverageMonthCount: 0 })
    show()
    await screen.findByText('No expense categories are available.')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/no elapsed months for this future year/)).toBeTruthy()
  })

  it('keeps long/duplicate names distinct by row IDs and carries full parent context for nested data', async () => {
    const data = report()
    const longName = 'Housing and utilities with an unusually long category name'
    data.categories = [category('root', longName, { children: [category('child', 'Common name', {
      children: [category('nested', 'Common name')],
    })] }), category('another', 'Common name')]
    vi.mocked(getAnnualBudgetOverview).mockResolvedValue(data)
    show()
    const table = await screen.findByRole('table')
    const names = within(table).getAllByRole('rowheader')
    expect(new Set(names.map(name => name.id)).size).toBe(4)
    expect(names[2].textContent).toContain(`Subcategory of ${longName} / Common name`)
    expect(within(table).getAllByRole('link', { name: 'Common name' })).toHaveLength(3)
  })
})

describe('household fiscal-year default accessibility', () => {
  it('explains the shared default and links to its single editor, separate from the current plan', async () => {
    show(true)
    await screen.findByLabelText('Housing overall annual target')
    expect(screen.queryByRole('combobox', { name: 'Default fiscal-year starting month' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save default' })).toBeNull()
    expect(screen.getByRole('link', { name: 'View household settings' }).getAttribute('href')).toBe('/household/settings')
    expect(screen.getByText(/Saved plans and monthly budgets are not changed by the household default/)).toBeTruthy()
    expect((screen.getByRole('combobox', { name: /^Fiscal year begins/ }) as HTMLSelectElement).value).toBe('1')
  })
})
