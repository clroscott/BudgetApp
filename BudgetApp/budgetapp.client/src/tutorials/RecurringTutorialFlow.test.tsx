import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, budgetFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { RecurringExpenseManagementPage } from '../pages/RecurringExpenseManagementPage'
import { BudgetManagementPage } from '../pages/BudgetManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAccounts } from '../accounts/accountApi'
import { getCategories } from '../categories/categoryApi'
import { createRecurringExpense, getRecurringExpenses, updateRecurringExpense, setRecurringExpenseActive, type RecurringExpenseItem } from '../recurringExpenses/recurringExpenseApi'
import { getBudget, getBudgetMonthOptions, initializeBudget, type BudgetPageData } from '../budgets/budgetApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { recurringTutorialGate, type RecurringTutorialPage } from './recurringTutorialState'
import { deferred } from '../test/deferred'

vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn() }))
vi.mock('../recurringExpenses/recurringExpenseApi', () => ({ getRecurringExpenses: vi.fn(), createRecurringExpense: vi.fn(), updateRecurringExpense: vi.fn(), setRecurringExpenseActive: vi.fn() }))
vi.mock('../budgets/budgetApi', async original => ({ ...await original<typeof import('../budgets/budgetApi')>(), getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(), initializeBudget: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
let items: RecurringExpenseItem[]
let budget: BudgetPageData
const sample: RecurringExpenseItem = { id: 'expense-a', name: 'Sample rent', amount: 100, currency: 'CAD', scope: 'Household', ownerUserId: null,
  budgetMode: 'Detailed', subcategoryId: 'rent', categoryName: 'Housing', subcategoryName: 'Rent', accountId: null, accountName: null,
  expectedDayOfMonth: 1, startsOn: '2020-01-01', endsOn: null, isActive: true }
function Routes() {
  const { path } = useRouter(); const tutorials = useTutorials()
  return <>{path === '/budgeting/recurring-expenses' ? <><RecurringExpenseManagementPage /><AppLink to="/tutorials">Leave recurring page</AppLink></>
    : path === '/budgeting' ? <BudgetManagementPage /> : <TutorialHubPage />}
    <output data-testid="step">{tutorials.activeTutorial ? tutorials.activeStepIndex : 'inactive'}</output>
  </>
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials')
  const households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}>
    <TutorialProvider><Routes /></TutorialProvider>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Plan recurring expenses tutorial controls' })
async function click(name: string) {
  const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function start(selection = 'expense-a') {
  const card = screen.getByRole('heading', { name: 'Plan recurring expenses' }).closest('article')!
  const button = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); await step(0)
  const select = await screen.findByLabelText('Use an existing item or add a new one') as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: selection } })
}
async function existingToSave() {
  await start(); await click('Use this item'); await step(1)
  fireEvent.click(screen.getByRole('button', { name: 'Edit' })); await click('Next'); await click('Next'); await click('Next'); await step(4)
}
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); items = [structuredClone(sample)]; budget = budgetFixture()
  vi.mocked(getRecurringExpenses).mockImplementation(async () => structuredClone(items))
  vi.mocked(getAccounts).mockResolvedValue([])
  vi.mocked(getCategories).mockResolvedValue([{ id: 'housing', name: 'Housing', type: 'Expense', displayOrder: 0, isActive: true,
    children: [{ id: 'rent', name: 'Rent', type: 'Expense', displayOrder: 0, isActive: true, children: [] }] }])
  vi.mocked(createRecurringExpense).mockImplementation(async (_hh, request) => { items.push({ ...sample, ...request, id: 'new-expense' }); return { id: 'new-expense' } })
  vi.mocked(updateRecurringExpense).mockImplementation(async (_hh, id, request) => { items = items.map(item => item.id === id ? { ...item, ...request } : item) })
  vi.mocked(getBudget).mockImplementation(async (_hh, year, month, scope) => ({ ...structuredClone(budget), year, month, scope }))
  vi.mocked(getBudgetMonthOptions).mockResolvedValue([])
  vi.mocked(initializeBudget).mockImplementation(async (_hh, year, month, scope) => { budget = { ...budget, id: 'recurring-budget', status: 'Draft', year, month, scope }; return structuredClone(budget) })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Recurring expenses guided setup', () => {
  it.each(['Owner', 'Viewer'] as const)('keeps an existing %s item unchanged without a forced write', async role => {
    if (role === 'Viewer') items[0].scope = 'Personal'
    show(role); await existingToSave()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); await click('Next'); await step(5)
    if (role === 'Viewer') expect((within(guide()).getByRole('button', { name: 'Build a monthly draft' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Finish here'); await step(8); await click('Continue recurring expenses')
    expect(window.location.pathname).toBe('/budgeting/recurring-expenses')
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('recurring-expenses', 1, 'Completed', 8))
    expect(createRecurringExpense).not.toHaveBeenCalled(); expect(updateRecurringExpense).not.toHaveBeenCalled()
    expect(setRecurringExpenseActive).not.toHaveBeenCalled(); expect(initializeBudget).not.toHaveBeenCalled()
  })
  it('creates only on an explicit page action and optionally builds a missing monthly draft once', async () => {
    items = []; budget.id = null; budget.status = null
    show(); await start('new'); await click('Use this item')
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'My rent' } })
    fireEvent.change(screen.getByLabelText(/Monthly amount/), { target: { value: '125.50' } })
    fireEvent.change(screen.getByLabelText('Subcategory'), { target: { value: 'rent' } })
    await click('Next'); await click('Next'); await click('Next'); await step(4)
    expect(createRecurringExpense).not.toHaveBeenCalled()
    const pending = deferred<{ id: string }>(); vi.mocked(createRecurringExpense).mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring expense' }))
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { items = [{ ...sample, id: 'new-expense', name: 'My rent', amount: 125.5 }]; pending.resolve({ id: 'new-expense' }) })
    await click('Next'); await click('Build a monthly draft'); await step(6); await click('Next'); await step(7)
    expect(initializeBudget).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Build from recurring expenses' }))
    await click('Next'); await step(8); await click('Continue budgeting')
    expect(window.location.pathname).toBe('/budgeting'); expect(createRecurringExpense).toHaveBeenCalledOnce(); expect(initializeBudget).toHaveBeenCalledOnce()
    expect(initializeBudget).toHaveBeenCalledWith('household-a', expect.any(Number), expect.any(Number), 'Household', 'from-recurring')
  })
  it('keeps an existing monthly budget without replacement', async () => {
    show(); await existingToSave(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await click('Next'); await click('Build a monthly draft'); await step(6); await click('Next'); await step(7)
    expect(screen.queryByRole('button', { name: 'Build from recurring expenses' })).toBeNull()
    await click('Next'); await click('Return to tutorials'); expect(initializeBudget).not.toHaveBeenCalled()
  })
  it('returns from monthly setup to the same just-saved expectation without another Add', async () => {
    items = []; show(); await start('new'); await click('Use this item')
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Return to this rent' } })
    fireEvent.change(screen.getByLabelText('Monthly amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Subcategory'), { target: { value: 'rent' } })
    await click('Next'); await click('Next'); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Add recurring expense' }))
    await click('Next'); await click('Build a monthly draft'); await step(6); await click('Back'); await step(5)
    expect((await screen.findByLabelText('Use an existing item or add a new one') as HTMLSelectElement).value).toBe('new')
    expect((screen.getByRole('button', { name: 'Add recurring expense' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Finish here'); await click('Continue recurring expenses')
    expect(createRecurringExpense).toHaveBeenCalledOnce(); expect(initializeBudget).not.toHaveBeenCalled()
  })
  it('reconciles a lost create reply and requires deliberate selection instead of another add', async () => {
    items = []; show(); await start('new'); await click('Use this item')
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'My rent' } })
    fireEvent.change(screen.getByLabelText(/Monthly amount/), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Subcategory'), { target: { value: 'rent' } })
    await click('Next'); await click('Next'); await click('Next')
    vi.mocked(createRecurringExpense).mockImplementationOnce(async (_hh, request) => { items = [{ ...sample, ...request, id: 'saved-after-loss' }]; throw new Error('Lost reply') })
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring expense' }))
    await screen.findByRole('button', { name: 'Check saved list' })
    expect((screen.getByLabelText('Use an existing item or add a new one') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved list' }))
    expect((screen.getByRole('button', { name: 'Add recurring expense' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(guide()).getByText('More details')); await click('Restart task selection'); await step(0)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(screen.getByLabelText('Use an existing item or add a new one'), { target: { value: 'saved-after-loss' } })
    await click('Use this item'); fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await click('Next'); await click('Next'); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await click('Next'); await click('Finish here'); await click('Continue recurring expenses')
    expect(createRecurringExpense).toHaveBeenCalledOnce(); expect(updateRecurringExpense).not.toHaveBeenCalled()
  })
  it('blocks pending/failed reads and preserves dirty inputs on Escape', async () => {
    const pending = deferred<RecurringExpenseItem[]>(); vi.mocked(getRecurringExpenses).mockReturnValueOnce(pending.promise)
    show(); const card = screen.getByRole('heading', { name: 'Plan recurring expenses' }).closest('article')!
    const startButton = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
    await waitFor(() => expect(startButton.disabled).toBe(false)); fireEvent.click(startButton); await step(0)
    expect((within(guide()).getByRole('button', { name: 'Use this item' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => pending.reject(new Error('Synthetic read failure')))
    expect(screen.queryByRole('button', { name: 'Add recurring expense' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Retry loading/ }))
    await screen.findByRole('button', { name: 'Add recurring expense' })
    fireEvent.change(screen.getByLabelText('Use an existing item or add a new one'), { target: { value: 'new' } })
    await click('Use this item'); fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Keep this text' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); expect(screen.getByTestId('step').textContent).toBe('inactive')
    expect((screen.getByLabelText('Item name') as HTMLInputElement).value).toBe('Keep this text')
    fireEvent.click(screen.getByRole('link', { name: 'Leave recurring page' })); expect(window.confirm).toHaveBeenCalled(); expect(window.location.pathname).toBe('/budgeting/recurring-expenses')
  })
  it('binds household, role, selection and scope and rejects stale/uncertain outcomes', () => {
    const page: RecurringTutorialPage = { householdId: 'hh', fresh: true, busy: false, dirty: false, uncertain: false, selection: 'a', scope: 'Personal', editing: false, saved: true }
    const task = { householdId: 'hh', role: 'Viewer', selection: 'a', scope: 'Personal' as const }
    expect(recurringTutorialGate(5, 'hh', 'Viewer', task, page, null).canNext).toBe(true)
    for (const changed of [{ fresh: false }, { busy: true }, { uncertain: true }, { dirty: true }, { selection: 'other' }, { scope: 'Household' as const }])
      expect(recurringTutorialGate(5, 'hh', 'Viewer', task, { ...page, ...changed }, null).canNext).toBe(false)
    expect(recurringTutorialGate(5, 'hh', 'Admin', task, page, null).canNext).toBe(false)
    expect(recurringTutorialGate(5, 'other', 'Viewer', task, page, null).canNext).toBe(false)
  })
})
