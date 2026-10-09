import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { budgetFixture, annualFixture, householdsFixture } from '../test/fixtures'
import { getBudget, getBudgetMonthOptions, saveBudget, deleteDraftBudget } from '../budgets/budgetApi'
import { helpWarnings } from '../help/helpTopics'
import { getYearlyPlan, saveYearlyPlan, changeFiscalYearStartMonth } from '../budgets/yearlyPlanApi'
import { BudgetManagementPage } from './BudgetManagementPage'
import { YearlyPlanManagementPage } from './YearlyPlanManagementPage'

vi.mock('../budgets/budgetApi', async importOriginal => ({
  ...await importOriginal<typeof import('../budgets/budgetApi')>(),
  getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(), saveBudget: vi.fn(), deleteDraftBudget: vi.fn(),
}))
vi.mock('../budgets/yearlyPlanApi', async importOriginal => ({
  ...await importOriginal<typeof import('../budgets/yearlyPlanApi')>(),
  getYearlyPlan: vi.fn(), saveYearlyPlan: vi.fn(), changeFiscalYearStartMonth: vi.fn(),
}))

function Routes({ children }: { children: ReactNode }) {
  const { path } = useRouter()
  // Exercise a visible shell-like exit, not the retired CSS-hidden page header.
  return path === '/dashboard' ? <p>Dashboard destination</p> : <>
    <AppLink to="/dashboard">Return to dashboard</AppLink>{children}
  </>
}
function show(page: ReactNode, path: string) {
  window.history.replaceState(null, '', path)
  render(<RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
    <Routes>{page}</Routes>
  </HouseholdContext.Provider></RouterProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getBudget).mockResolvedValue(budgetFixture())
  vi.mocked(getBudgetMonthOptions).mockResolvedValue([])
  vi.mocked(getYearlyPlan).mockResolvedValue(annualFixture())
  vi.mocked(saveBudget).mockResolvedValue({ ...budgetFixture(), categories: [{ ...budgetFixture().categories[0], budgetedAmount: 250 }] })
  vi.mocked(saveYearlyPlan).mockResolvedValue({ ...annualFixture(), categories: [{ ...annualFixture().categories[0], annualTargetAmount: 2400 }] })
  vi.mocked(changeFiscalYearStartMonth).mockResolvedValue({ fiscalYearStartMonth: 3 })
})

describe('monthly budget guard integration', () => {
  it('keeps deletion consequences visible with help collapsed and still requires confirmation', async () => {
    show(<BudgetManagementPage />, '/budgeting?year=2026&month=1')
    await screen.findByLabelText('Housing budget')
    const warning = screen.getByText(helpWarnings.deleteDraft)
    expect(warning.closest('details')).toBeNull()
    expect(screen.getByText('About removal and replacement').closest('details')!.open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(window.confirm).toHaveBeenCalledWith(helpWarnings.confirmDeleteDraft)
    expect(deleteDraftBudget).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Housing budget') as HTMLInputElement).value).toBe('100')
  })
  it('opening help preserves dirty budget amounts, and canceled deeper-help navigation keeps them protected', async () => {
    show(<BudgetManagementPage />, '/budgeting?year=2026&month=1')
    const amount = await screen.findByLabelText('Housing budget') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '250' } })
    fireEvent.click(screen.getByText('About budget states'))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(saveBudget).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Read more: Monthly budget states' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/budgeting')
    expect(amount.value).toBe('250')
    expect(saveBudget).not.toHaveBeenCalled()
    const close = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(close)
    expect(close.defaultPrevented).toBe(true)
  })
  it('does not warn after loading an untouched budget', async () => {
    show(<BudgetManagementPage />, '/budgeting?year=2026&month=1')
    await screen.findByLabelText('Housing budget')
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(screen.getByText('Dashboard destination')).toBeTruthy()
  })
  it.each(['month', 'year', 'scope'])('canceling a %s change preserves context and amounts', async field => {
    show(<BudgetManagementPage />, '/budgeting?year=2026&month=1')
    const amount = await screen.findByLabelText('Housing budget')
    fireEvent.change(amount, { target: { value: '250' } })
    const label = field === 'month' ? 'Month' : field === 'year' ? 'Year' : 'Scope'
    const control = screen.getByLabelText(label) as HTMLInputElement
    const initial = control.value
    fireEvent.change(control, { target: { value: field === 'month' ? '2' : field === 'year' ? '2027' : 'Personal' } })
    expect(control.value).toBe(initial)
    expect((amount as HTMLInputElement).value).toBe('250')
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(getBudget).toHaveBeenCalledTimes(1)
  })
  it('dashboard navigation prompts once, failed save stays dirty, successful save clears it', async () => {
    show(<BudgetManagementPage />, '/budgeting?year=2026&month=1')
    const amount = await screen.findByLabelText('Housing budget')
    fireEvent.change(amount, { target: { value: '250' } })
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    vi.mocked(saveBudget).mockRejectedValueOnce(new Error('Sample save failed'))
    fireEvent.click(screen.getByText('Save budget'))
    await screen.findByText('Sample save failed')
    expect((amount as HTMLInputElement).value).toBe('250')
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect(window.confirm).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('Save budget'))
    await waitFor(() => expect((screen.getByText('Save budget') as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Dashboard destination')).toBeTruthy()
  })
  it('protects section links and does not ask twice when leaving is approved', async () => {
    show(<BudgetManagementPage />, '/budgeting?year=2026&month=1')
    fireEvent.change(await screen.findByLabelText('Housing budget'), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('link', { name: 'Annual targets' }))
    expect(window.location.pathname).toBe('/budgeting')
    expect(window.confirm).toHaveBeenCalledTimes(1)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(window.location.pathname).toBe('/dashboard')
  })
})

describe('annual targets and independent default setting', () => {
  it.each(['Household', 'Personal'])('links an existing monthly budget with its year, month, and %s scope', async scope => {
    vi.mocked(getBudgetMonthOptions).mockResolvedValue([
      { id: 'budget-a', year: 2026, month: 1, status: 'Active' },
    ])
    show(<YearlyPlanManagementPage />, '/budgeting/annual-targets')
    await screen.findByLabelText('Housing overall annual target')
    if (scope === 'Personal') {
      fireEvent.change(screen.getByLabelText('Scope'), { target: { value: scope } })
    }
    const link = await screen.findByRole('link', { name: /Open existing budget/ })
    expect(link.getAttribute('href')).toBe(`/budgeting?year=2026&month=1&scope=${scope}`)
    fireEvent.click(link)
    expect(window.location.pathname).toBe('/budgeting')
    expect(new URLSearchParams(window.location.search).get('scope')).toBe(scope)
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('encodes DOM-sourced scope text instead of letting it inject query parameters or markup', async () => {
    vi.mocked(getBudgetMonthOptions).mockResolvedValue([
      { id: 'budget-a', year: 2026, month: 1, status: 'Active' },
    ])
    show(<YearlyPlanManagementPage />, '/budgeting/annual-targets')
    await screen.findByLabelText('Housing overall annual target')
    const scopeSelect = screen.getByLabelText('Scope') as HTMLSelectElement
    // A TypeScript cast does not sanitize DOM values. Exercise the exact source
    // from the CodeQL trace, including URL delimiters and HTML-looking text.
    const scopeText = 'Household&year=1999#"><img data-url-injection src=x onerror=alert(1)>'
    scopeSelect.add(new Option('Unexpected scope', scopeText))
    fireEvent.change(scopeSelect, { target: { value: scopeText } })
    const link = await screen.findByRole('link', { name: /Open existing budget/ })
    const url = new URL((link as HTMLAnchorElement).href)
    expect(url.origin).toBe(window.location.origin)
    expect(url.pathname).toBe('/budgeting')
    const parameterNames: string[] = []
    url.searchParams.forEach((_value, name) => parameterNames.push(name))
    expect(parameterNames).toEqual(['year', 'month', 'scope'])
    expect(url.searchParams.get('year')).toBe('2026')
    expect(url.searchParams.get('month')).toBe('1')
    expect(url.searchParams.get('scope')).toBe(scopeText)
    expect(url.hash).toBe('')
    expect(link.getAttribute('href')).not.toContain('<')
    expect(document.querySelector('[data-url-injection]')).toBeNull()
  })

  it('does not warn while initially loading or after loading unchanged values', async () => {
    show(<YearlyPlanManagementPage />, '/budgeting/annual-targets')
    const loadingEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(loadingEvent)
    expect(loadingEvent.defaultPrevented).toBe(false)
    await screen.findByLabelText('Housing overall annual target')
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('canceling year/scope/dashboard navigation preserves annual edits', async () => {
    show(<YearlyPlanManagementPage />, '/budgeting/annual-targets')
    const amount = await screen.findByLabelText('Housing overall annual target')
    fireEvent.change(amount, { target: { value: '2400' } })
    const year = screen.getByLabelText('Fiscal year starting year') as HTMLInputElement
    const initial = year.value
    fireEvent.change(year, { target: { value: '2027' } })
    expect(year.value).toBe(initial)
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'Personal' } })
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('Household')
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect((amount as HTMLInputElement).value).toBe('2400')
    expect(window.confirm).toHaveBeenCalledTimes(3)
    expect(getYearlyPlan).toHaveBeenCalledTimes(1)
  })
  it('canceling the household-settings link preserves unsaved target amounts', async () => {
    window.history.replaceState(null, '', '/budgeting/annual-targets')
    render(<RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
      <YearlyPlanManagementPage />
    </HouseholdContext.Provider></RouterProvider>)
    const amount = await screen.findByLabelText('Housing overall annual target')
    fireEvent.change(amount, { target: { value: '2400' } })
    fireEvent.click(screen.getByRole('link', { name: 'View household settings' }))
    expect(window.location.pathname).toBe('/budgeting/annual-targets')
    expect((amount as HTMLInputElement).value).toBe('2400')
    expect(getYearlyPlan).toHaveBeenCalledTimes(1)
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
  it('saving a plan-period edit leaves the shared default unchanged', async () => {
    window.history.replaceState(null, '', '/budgeting/annual-targets')
    render(<RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
      <Routes><YearlyPlanManagementPage /></Routes>
    </HouseholdContext.Provider></RouterProvider>)
    fireEvent.change(await screen.findByLabelText('Housing overall annual target'), { target: { value: '2400' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(screen.getByRole('combobox', { name: /^Fiscal year begins/ }), { target: { value: '3' } })
    vi.mocked(saveYearlyPlan).mockResolvedValue({ ...annualFixture(), fiscalYearStartMonth: 3,
      categories: [{ ...annualFixture().categories[0], annualTargetAmount: 2400 }] })
    fireEvent.click(screen.getByText('Save annual targets'))
    await screen.findByText('Annual targets were saved.')
    expect((screen.getByRole('combobox', { name: /^Fiscal year begins/ }) as HTMLSelectElement).value).toBe('3')
    expect(screen.getByText(/Household default for new annual plans: January/)).toBeTruthy()
    expect(changeFiscalYearStartMonth).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockClear()
    fireEvent.click(screen.getByText('Return to dashboard'))
    expect(window.confirm).not.toHaveBeenCalled()
  })
})
