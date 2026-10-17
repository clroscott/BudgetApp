import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, budgetFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { BudgetManagementPage } from '../pages/BudgetManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { ApiError } from '../api/apiClient'
import { createBudget, getBudget, getBudgetMonthOptions, saveBudget, changeBudgetStatus, copyBudget,
  initializeBudget, deleteDraftBudget, type BudgetPageData } from '../budgets/budgetApi'
import { deferred } from '../test/deferred'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'

vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
vi.mock('../budgets/budgetApi', async original => ({ ...await original<typeof import('../budgets/budgetApi')>(),
  createBudget: vi.fn(), getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(), saveBudget: vi.fn(), changeBudgetStatus: vi.fn(),
  copyBudget: vi.fn(), initializeBudget: vi.fn(), deleteDraftBudget: vi.fn() }))
let saved: BudgetPageData
const guide = () => screen.getByRole('region', { name: 'Build your first budget tutorial controls' })
function Routes() {
  const { path } = useRouter()
  const tutorials = useTutorials()
  return <>
    {path === '/budgeting' ? <><AppLink to="/tutorials">Leave budget page</AppLink><BudgetManagementPage /></> : <TutorialHubPage />}
    {!tutorials.activeTutorial && <button onClick={() => void tutorials.start('build-first-budget', true)}>Start monthly guide</button>}
  </>
}
function show(role: 'Owner' | 'Viewer' | 'Admin' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials')
  let household = householdsFixture()
  household.currentHousehold = { ...household.currentHousehold!, role }
  const auth = authFixture()
  const contents = () => <AuthContext.Provider value={auth}><RouterProvider><HouseholdContext.Provider value={household}>
    <TutorialProvider><Routes /></TutorialProvider>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>
  const view = render(contents())
  return { ...view, changeContext: (change: { id?: string; role?: 'Owner' | 'Viewer' | 'Admin' }) => {
    household = { ...household, currentHousehold: { ...household.currentHousehold!, ...change } }; view.rerender(contents())
  } }
}
async function clickGuide(name: string) {
  const button = await within(guide()).findByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Start monthly guide' }))
  await screen.findByRole('heading', { name: 'Choose your month' })
  await screen.findByLabelText('Housing budget')
}
async function toPlanning() {
  await start(); await clickGuide('Use this month'); await clickGuide('Plan amounts')
}
async function toActivation() {
  await toPlanning(); await reviewPlan(); await reviewActivation()
}
async function reviewPlan() {
  await clickGuide('Totals and breakdowns'); await clickGuide('Next category')
  await clickGuide('One more category'); await clickGuide('Review and save')
}
async function reviewActivation() {
  await clickGuide('Draft or Active?')
  await within(guide()).findByText(/Draft: saved, but still planning/)
  await clickGuide('Choose status')
}
function assertNoWrites() {
  for (const command of [createBudget, saveBudget, changeBudgetStatus, copyBudget, initializeBudget, deleteDraftBudget]) expect(command).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout()
  saved = budgetFixture()
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '2026-10-16', updatedAtUtc: '2026-10-16', completedAtUtc: null, dismissedAtUtc: null }))
  vi.mocked(getBudget).mockImplementation(async (_hh, year, month, scope) => ({ ...structuredClone(saved), year, month, scope }))
  vi.mocked(getBudgetMonthOptions).mockResolvedValue([])
  vi.mocked(createBudget).mockImplementation(async (_hh, year, month, scope) => {
    saved = { ...saved, id: 'new-budget', year, month, scope, status: 'Draft', categories: saved.categories.map(root => ({ ...root, budgetedAmount: null })) }
    return structuredClone(saved)
  })
  vi.mocked(saveBudget).mockImplementation(async (_hh, _id, lines) => {
    saved = { ...saved, categories: saved.categories.map(root => ({ ...root,
      budgetedAmount: lines.find(line => line.categoryId === root.id)?.budgetedAmount ?? null,
      children: root.children.map(child => ({ ...child, budgetedAmount: lines.find(line => line.categoryId === child.id)?.budgetedAmount ?? null })),
    })) }
    return structuredClone(saved)
  })
  vi.mocked(changeBudgetStatus).mockImplementation(async () => { saved = { ...saved, status: 'Active' }; return structuredClone(saved) })
})
afterEach(restoreTutorialLayout)

describe('guided monthly planning on the real budget page', () => {
  it.each([
    ['Draft', 'Return to tutorials'], ['Active', 'Return to tutorials'],
    ['Draft', 'Continue budgeting'], ['Active', 'Continue budgeting'],
  ] as const)('reviews an existing %s and chooses %s without a financial write, then replays safely', async (status, destination) => {
    saved.status = status; show(); await toActivation()
    if (status === 'Draft') await clickGuide('Keep as draft'); else await clickGuide('Verify budget')
    const reads = vi.mocked(getBudget).mock.calls.length
    const selectedMonth = (screen.getByLabelText('Month') as HTMLSelectElement).value
    const selectedScope = (screen.getByLabelText('Scope') as HTMLSelectElement).value
    await clickGuide(destination)
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('build-first-budget', 1, 'Completed', 9))
    expect(screen.queryByRole('region', { name: 'Build your first budget tutorial controls' })).toBeNull()
    if (destination === 'Continue budgeting') {
      expect(window.location.pathname).toBe('/budgeting')
      expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe(selectedMonth)
      expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe(selectedScope)
      expect((screen.getByLabelText('Housing budget') as HTMLInputElement).value).toBe('100')
      expect(vi.mocked(getBudget).mock.calls).toHaveLength(reads)
      fireEvent.change(screen.getByLabelText('Housing budget'), { target: { value: '125' } })
      expect((screen.getByRole('button', { name: 'Save budget' }) as HTMLButtonElement).disabled).toBe(false)
      vi.mocked(window.confirm).mockReturnValue(true)
      fireEvent.click(screen.getByRole('link', { name: 'Leave budget page' }))
    }
    expect(window.location.pathname).toBe('/tutorials')
    fireEvent.click(screen.getByRole('button', { name: 'Replay Quick monthly' }))
    await screen.findByRole('heading', { name: 'Choose your month' })
    assertNoWrites()
  })

  it('creates only from the page action, accepts zero, saves explicitly and waits for activation', async () => {
    saved.id = null; saved.status = null; saved.categories[0].budgetedAmount = null
    show(); fireEvent.click(screen.getByRole('button', { name: 'Start monthly guide' }))
    await screen.findByRole('heading', { name: 'Choose your month' }); await clickGuide('Use this month')
    expect(createBudget).not.toHaveBeenCalled()
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Create blank budget' })); await clickGuide('Plan amounts')
    expect(createBudget).toHaveBeenCalledOnce()
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Housing budget'), { target: { value: '0' } })
    await reviewPlan()
    expect(window.confirm).not.toHaveBeenCalled() // same-page Next keeps dirty inputs
    const pending = deferred<BudgetPageData>()
    vi.mocked(saveBudget).mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    saved.categories[0].budgetedAmount = 0
    await act(async () => pending.resolve(structuredClone(saved)))
    await reviewActivation()
    expect(changeBudgetStatus).not.toHaveBeenCalled()
    expect((within(guide()).getByRole('button', { name: 'Verify activation' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Activate' })); await clickGuide('Verify budget'); await clickGuide('Return to tutorials')
    expect(saveBudget).toHaveBeenCalledExactlyOnceWith('household-a', 'new-budget', [{ categoryId: 'housing', budgetedAmount: 0 }])
    expect(changeBudgetStatus).toHaveBeenCalledExactlyOnceWith('household-a', 'new-budget', 'activate')
  })

  it('keeps dirty edits after Exit, honors navigation cancellation, and restarts from selection', async () => {
    show(); await toPlanning()
    fireEvent.change(screen.getByLabelText('Housing budget'), { target: { value: '250' } })
    await reviewPlan(); await clickGuide('Back')
    expect(window.confirm).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Build your first budget tutorial controls' })).toBeNull()
    expect((screen.getByLabelText('Housing budget') as HTMLInputElement).value).toBe('250')
    fireEvent.click(screen.getByRole('link', { name: 'Leave budget page' }))
    expect(window.confirm).toHaveBeenCalledOnce(); expect(window.location.pathname).toBe('/budgeting')
    fireEvent.click(screen.getByRole('button', { name: 'Start monthly guide' }))
    await screen.findByRole('heading', { name: 'Choose your month' }); assertNoWrites()
  })

  it('requires fresh reads after an uncertain save and never retries a financial command', async () => {
    show(); await toPlanning()
    fireEvent.change(screen.getByLabelText('Housing budget'), { target: { value: '250' } }); await reviewPlan()
    vi.mocked(saveBudget).mockImplementationOnce(async () => {
      saved.categories[0].budgetedAmount = 250; throw new ApiError('Synthetic lost response', 0)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
    await screen.findByRole('button', { name: 'Check saved budget' })
    expect(screen.queryByRole('button', { name: 'Save budget' })).toBeNull()
    expect(saveBudget).toHaveBeenCalledOnce()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved budget' }))
    await reviewActivation(); await clickGuide('Keep as draft'); await clickGuide('Return to tutorials')
    expect(saveBudget).toHaveBeenCalledOnce(); expect(changeBudgetStatus).not.toHaveBeenCalled()
  })

  it('reconciles a lost create result without another create', async () => {
    saved.id = null; saved.status = null
    show(); fireEvent.click(screen.getByRole('button', { name: 'Start monthly guide' }))
    await clickGuide('Use this month')
    vi.mocked(createBudget).mockImplementationOnce(async () => {
      saved = { ...saved, id: 'created-on-server', status: 'Draft' }; throw new ApiError('Synthetic lost create result', 0)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create blank budget' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved budget' }))
    await clickGuide('Plan amounts')
    expect(createBudget).toHaveBeenCalledOnce(); expect(saveBudget).not.toHaveBeenCalled()
  })

  it('reconciles a lost activation result without another activation', async () => {
    show(); await toActivation()
    vi.mocked(changeBudgetStatus).mockImplementationOnce(async () => {
      saved.status = 'Active'; throw new ApiError('Synthetic lost activation result', 0)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved budget' }))
    await clickGuide('Verify budget'); await clickGuide('Return to tutorials')
    expect(changeBudgetStatus).toHaveBeenCalledOnce()
  })

  it.each(['Owner', 'Admin', 'Viewer'] as const)('does not turn a failed read into creation for %s', async role => {
    vi.mocked(getBudget).mockRejectedValue(new ApiError('Synthetic load failure', 503))
    show(role); fireEvent.click(screen.getByRole('button', { name: 'Start monthly guide' }))
    await within(guide()).findByText(/Check the error on the page/)
    expect(screen.queryByRole('button', { name: 'Create blank budget' })).toBeNull()
    assertNoWrites()
  })

  it.each(['Closed', 'Viewer', 'no-categories'] as const)('explains %s without offering a successful task', async condition => {
    if (condition === 'Closed') saved.status = 'Closed'
    if (condition === 'no-categories') saved.categories = []
    show(condition === 'Viewer' ? 'Viewer' : 'Owner')
    fireEvent.click(screen.getByRole('button', { name: 'Start monthly guide' }))
    await within(guide()).findByText(condition === 'Closed' ? /This month is closed/ : condition === 'Viewer' ? /current role cannot edit/ : /active expense category/)
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    assertNoWrites()
  })

  it.each(['Month', 'Scope'])('invalidates %s and role changes instead of silently retargeting', async field => {
    const view = show(); await toPlanning()
    fireEvent.change(screen.getByLabelText(field), { target: { value: field === 'Scope' ? 'Personal' : saved.month === 12 ? '1' : String(saved.month + 1) } })
    await within(guide()).findByText(/Different month or scope/)
    view.changeContext({ role: 'Viewer' })
    await within(guide()).findByText(/Household or permission changed/)
    assertNoWrites()
  })

  it('ignores a delayed write outcome from the previous household', async () => {
    const pending = deferred<BudgetPageData>()
    const view = show(); await toPlanning()
    fireEvent.change(screen.getByLabelText('Housing budget'), { target: { value: '250' } }); await reviewPlan()
    vi.mocked(saveBudget).mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
    view.changeContext({ id: 'household-b' })
    await waitFor(() => expect((screen.getByLabelText('Housing budget') as HTMLInputElement).value).toBe('100'))
    await act(async () => pending.resolve({ ...saved, categories: [{ ...saved.categories[0], budgetedAmount: 999 }] }))
    expect((screen.getByLabelText('Housing budget') as HTMLInputElement).value).toBe('100')
    await within(guide()).findByText(/Household or permission changed/)
    expect(saveBudget).toHaveBeenCalledOnce()
  })

  it('keeps Overall/Detailed confirmation and exact saved choices on the real controls', async () => {
    const root = saved.categories[0]
    root.children = [{ ...root, id: 'rent', name: 'Rent', budgetedAmount: null, children: [] }]
    show(); await toPlanning()
    fireEvent.click(screen.getByRole('button', { name: 'Detailed' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Housing budget')).toBeTruthy()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Detailed' }))
    fireEvent.change(await screen.findByLabelText('Rent budget'), { target: { value: '125' } })
    await reviewPlan(); fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
    await reviewActivation()
    expect(saveBudget).toHaveBeenLastCalledWith('household-a', 'budget-a', [{ categoryId: 'rent', budgetedAmount: 125 }])
  })

  it('walks several named categories and saves a breakdown once, without a parent total on top', async () => {
    const base = saved.categories[0]
    saved.categories = [base,
      { ...base, id: 'transport', name: 'Transport', budgetedAmount: null, children: [
        { ...base, id: 'fuel', name: 'Fuel', budgetedAmount: null },
        { ...base, id: 'parking', name: 'Parking', budgetedAmount: null },
      ] },
      { ...base, id: 'groceries', name: 'Groceries', budgetedAmount: null },
      { ...base, id: 'leisure', name: 'Leisure', budgetedAmount: null },
    ]
    show(); await toPlanning()
    expect(document.querySelector('.tutorial-task-target')?.textContent).toContain('Housing')
    await clickGuide('Totals and breakdowns')
    const mode = document.querySelector<HTMLElement>('[data-tutorial-id="budget-tutorial-breakdown-mode"]')!
    expect(mode.textContent).toContain('Transport')
    fireEvent.click(within(mode).getByRole('button', { name: 'Detailed' }))
    const fuel = await screen.findByLabelText('Fuel budget') as HTMLInputElement
    await waitFor(() => expect(document.querySelector('.tutorial-task-target')?.textContent).toContain('Fuel'))
    act(() => fuel.focus()); fireEvent.change(fuel, { target: { value: '50' } })
    expect(document.activeElement).toBe(fuel)
    fireEvent.change(screen.getByLabelText('Parking budget'), { target: { value: '25' } })
    await clickGuide('Next category')
    expect(document.querySelector('.tutorial-task-target')?.textContent).toContain('Groceries')
    fireEvent.change(screen.getByLabelText('Groceries budget'), { target: { value: '200' } })
    await clickGuide('One more category')
    expect(document.querySelector('.tutorial-task-target')?.textContent).toContain('Leisure')
    fireEvent.change(screen.getByLabelText('Leisure budget'), { target: { value: '30' } })
    await clickGuide('Review and save')
    expect(screen.getByRole('group', { name: 'Monthly total and save' }).textContent).toContain('405.00')
    assertNoWrites()
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
    await reviewActivation()
    const lines = vi.mocked(saveBudget).mock.calls[0][2]
    expect(lines).toHaveLength(5)
    expect(lines).toEqual(expect.arrayContaining([
      { categoryId: 'housing', budgetedAmount: 100 }, { categoryId: 'fuel', budgetedAmount: 50 },
      { categoryId: 'parking', budgetedAmount: 25 }, { categoryId: 'groceries', budgetedAmount: 200 }, { categoryId: 'leisure', budgetedAmount: 30 },
    ]))
    expect(lines.some(line => line.categoryId === 'transport')).toBe(false)
    expect(changeBudgetStatus).not.toHaveBeenCalled()
  })

  it('explains an existing Detailed category without switching it or inventing extra categories', async () => {
    const base = saved.categories[0]
    base.budgetedAmount = null
    base.children = [{ ...base, id: 'rent', name: 'Rent', budgetedAmount: 100, children: [] }]
    show(); fireEvent.click(screen.getByRole('button', { name: 'Start monthly guide' }))
    await clickGuide('Use this month'); await clickGuide('Plan amounts')
    await within(guide()).findByText(/This category already uses Detailed amounts/)
    await clickGuide('Totals and breakdowns')
    expect((screen.getByLabelText('Rent budget') as HTMLInputElement).value).toBe('100')
    await clickGuide('Next category')
    await within(guide()).findByRole('heading', { name: 'No more categories to plan' })
    await clickGuide('One more category'); await clickGuide('Review and save'); await reviewActivation()
    await clickGuide('Keep as draft'); await clickGuide('Return to tutorials')
    expect(window.confirm).not.toHaveBeenCalled(); assertNoWrites()
  })
})
