import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { BackToTopButton } from '../components/BackToTopButton'
import { annualFixture, budgetFixture, householdsFixture } from '../test/fixtures'
import { getBudget, getBudgetMonthOptions } from '../budgets/budgetApi'
import { getYearlyPlan, saveYearlyPlan } from '../budgets/yearlyPlanApi'
import { BudgetManagementPage } from './BudgetManagementPage'
import { YearlyPlanManagementPage } from './YearlyPlanManagementPage'
import { useBudgetTutorialPage } from '../tutorials/useBudgetTutorialPage'

vi.mock('../tutorials/useBudgetTutorialPage', () => ({ useBudgetTutorialPage: vi.fn(() => false) }))

vi.mock('../budgets/budgetApi', async original => ({
  ...await original<typeof import('../budgets/budgetApi')>(),
  getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(),
}))
vi.mock('../budgets/yearlyPlanApi', async original => ({
  ...await original<typeof import('../budgets/yearlyPlanApi')>(),
  getYearlyPlan: vi.fn(), saveYearlyPlan: vi.fn(),
}))

let barHeight = 112
let resized: () => void
let observedBar: Element | undefined
const disconnect = vi.fn()

beforeEach(() => {
  window.history.replaceState(null, '', '/budgeting?year=2026&month=1')
  barHeight = 112
  disconnect.mockClear()
  observedBar = undefined
  vi.mocked(useBudgetTutorialPage).mockReturnValue(false)
  vi.mocked(getBudget).mockResolvedValue(budgetFixture())
  vi.mocked(getBudgetMonthOptions).mockResolvedValue([])
  vi.mocked(getYearlyPlan).mockResolvedValue(annualFixture())
  vi.mocked(saveYearlyPlan).mockClear()
  vi.stubGlobal('scrollY', 600)
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void
    isBudgetBar = false
    constructor(callback: () => void) { this.callback = callback }
    observe(target: Element) {
      if (target.classList.contains('budget-save-bar')) {
        observedBar = target
        this.isBudgetBar = true
        resized = this.callback
      }
    }
    disconnect() { if (this.isBudgetBar) disconnect() }
  })
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('budget-save-bar')
      ? new DOMRect(0, 0, 800, barHeight)
      : originalRect.call(this)
  })
})
afterEach(() => vi.unstubAllGlobals())

function show(annual = false) {
  if (annual) window.history.replaceState(null, '', '/budgeting/annual-targets')
  const contents = () => <RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
    {annual ? <YearlyPlanManagementPage /> : <BudgetManagementPage />}<BackToTopButton />
  </HouseholdContext.Provider></RouterProvider>
  const view = render(contents())
  return { ...view, refresh: () => view.rerender(contents()) }
}

describe('monthly budget fixed-action spacing', () => {
  it('remeasures the replacement bar after entering and leaving the tutorial', async () => {
    const view = show()
    const originalBar = await screen.findByRole('region', { name: 'Budget actions' })
    const page = screen.getByRole('main')
    expect(observedBar).toBe(originalBar)
    expect(page.style.getPropertyValue('--budget-actions-height')).toBe('112px')

    vi.mocked(useBudgetTutorialPage).mockReturnValue(true)
    view.refresh()
    expect(page.style.getPropertyValue('--budget-actions-height')).toBe('')
    expect(disconnect).toHaveBeenCalledOnce()

    vi.mocked(useBudgetTutorialPage).mockReturnValue(false)
    view.refresh()
    const replacementBar = screen.getByRole('region', { name: 'Budget actions' })
    expect(replacementBar).not.toBe(originalBar)
    expect(observedBar).toBe(replacementBar)
    expect(page.style.getPropertyValue('--budget-actions-height')).toBe('112px')
    barHeight = 248.5
    act(() => resized())
    expect(page.style.getPropertyValue('--budget-actions-height')).toBe('249px')
  })

  it('reserves the measured bar height and keeps Back to top inside asynchronously loaded actions', async () => {
    const view = show()
    const actions = await screen.findByRole('region', { name: 'Budget actions' })
    const page = screen.getByRole('main')
    expect(page.style.getPropertyValue('--budget-actions-height')).toBe('112px')
    await waitFor(() => expect(actions.contains(screen.getByRole('button', { name: 'Back to top' }))).toBe(true))
    barHeight = 248.5
    act(() => resized())
    expect(page.style.getPropertyValue('--budget-actions-height')).toBe('249px')
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('removes the reserved height when switching to a month with no budget', async () => {
    show()
    await screen.findByRole('region', { name: 'Budget actions' })
    const page = screen.getByRole('main')
    vi.mocked(getBudget).mockResolvedValue({ ...budgetFixture(), id: null, status: null })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'No budget for February 2026' })
    expect(screen.queryByRole('region', { name: 'Budget actions' })).toBeNull()
    expect(page.style.getPropertyValue('--budget-actions-height')).toBe('')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to top' }).closest('[data-back-to-top-host]')).toBeNull())
  })
})

describe('annual target action placement', () => {
  it('keeps one Back to top inside annual actions without saving or losing edits', async () => {
    show(true)
    const actions = await screen.findByRole('region', { name: 'Annual target actions' })
    await waitFor(() => expect(actions.contains(screen.getByRole('button', { name: 'Back to top' }))).toBe(true))
    expect(screen.getAllByRole('button', { name: 'Back to top' })).toHaveLength(1)
    const amount = screen.getByLabelText('Housing overall annual target') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '2400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to top' }))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(amount.value).toBe('2400')
    expect(vi.mocked(saveYearlyPlan)).not.toHaveBeenCalled()
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(true)
  })

  it('releases the annual host when a changed scope fails to load', async () => {
    show(true)
    const actions = await screen.findByRole('region', { name: 'Annual target actions' })
    await waitFor(() => expect(actions.contains(screen.getByRole('button', { name: 'Back to top' }))).toBe(true))
    vi.mocked(getYearlyPlan).mockRejectedValueOnce(new Error('Synthetic load failed'))
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'Personal' } })
    await screen.findByRole('heading', { name: 'Could not load annual targets' })
    expect(screen.queryByRole('region', { name: 'Annual target actions' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to top' }).closest('[data-back-to-top-host]')).toBeNull())
    expect(vi.mocked(saveYearlyPlan)).not.toHaveBeenCalled()
  })
})
