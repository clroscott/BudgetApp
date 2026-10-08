import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { BackToTopButton } from '../components/BackToTopButton'
import { budgetFixture, householdsFixture } from '../test/fixtures'
import { getBudget, getBudgetMonthOptions } from '../budgets/budgetApi'
import { BudgetManagementPage } from './BudgetManagementPage'

vi.mock('../budgets/budgetApi', async original => ({
  ...await original<typeof import('../budgets/budgetApi')>(),
  getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(),
}))

let barHeight = 112
let resized: () => void
const disconnect = vi.fn()

beforeEach(() => {
  window.history.replaceState(null, '', '/budgeting?year=2026&month=1')
  barHeight = 112
  disconnect.mockClear()
  vi.mocked(getBudget).mockResolvedValue(budgetFixture())
  vi.mocked(getBudgetMonthOptions).mockResolvedValue([])
  vi.stubGlobal('scrollY', 600)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback }
    observe() {}
    disconnect = disconnect
  })
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('budget-save-bar')
      ? new DOMRect(0, 0, 800, barHeight)
      : originalRect.call(this)
  })
})
afterEach(() => vi.unstubAllGlobals())

function show() {
  return render(<RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
    <BudgetManagementPage /><BackToTopButton />
  </HouseholdContext.Provider></RouterProvider>)
}

describe('monthly budget fixed-action spacing', () => {
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
