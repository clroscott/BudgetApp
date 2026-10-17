import { useEffect } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture, budgetFixture, annualFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { BudgetManagementPage } from '../pages/BudgetManagementPage'
import { YearlyPlanManagementPage } from '../pages/YearlyPlanManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getBudget, getBudgetMonthOptions, changeBudgetStatus, saveBudget, type BudgetMonthOption } from '../budgets/budgetApi'
import { getYearlyPlan, saveYearlyPlan, allocateYearlyPlan, type YearlyPlanData } from '../budgets/yearlyPlanApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { annualBudgetGate } from './annualBudgetTutorialState'
import { ApiError } from '../api/apiClient'
vi.mock('../budgets/budgetApi', async original => ({ ...await original<typeof import('../budgets/budgetApi')>(), getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(), changeBudgetStatus: vi.fn(), saveBudget: vi.fn() }))
vi.mock('../budgets/yearlyPlanApi', async original => ({ ...await original<typeof import('../budgets/yearlyPlanApi')>(), getYearlyPlan: vi.fn(), saveYearlyPlan: vi.fn(), allocateYearlyPlan: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1
let annual: YearlyPlanData, options: BudgetMonthOption[]
function Routes() { const { path } = useRouter(); const tutorial = useTutorials(); return <>{path === '/budgeting' ? <BudgetManagementPage /> : path === '/budgeting/annual-targets' ? <YearlyPlanManagementPage /> : <TutorialHubPage />}<output data-testid="step">{tutorial.activeTutorial ? tutorial.activeStepIndex : 'inactive'}</output></> }
function Guard({ enabled }: { enabled: boolean }) { const { registerNavigationGuard } = useRouter(); useEffect(() => enabled ? registerNavigationGuard(() => 'Synthetic navigation guard') : undefined, [enabled, registerNavigationGuard]); return null }
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture(), auth = authFixture(); households.currentHousehold = { ...households.currentHousehold!, role }; let blocked = false
  const contents = () => <AuthContext.Provider value={auth}><RouterProvider><HouseholdContext.Provider value={households}><TutorialProvider><Guard enabled={blocked} /><Routes /></TutorialProvider></HouseholdContext.Provider></RouterProvider></AuthContext.Provider>
  const view = render(contents()); return { ...view, block: () => { blocked = true; view.rerender(contents()) } }
}
const guide = () => screen.getByRole('region', { name: 'Budget from annual targets tutorial controls' })
async function click(name: string) { const button = await within(guide()).findByRole('button', { name }) as HTMLButtonElement; await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button) }
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function launch() { const button = screen.getByRole('button', { name: 'Start from annual targets' }) as HTMLButtonElement; await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); await step(0) }
async function toImpact() { await launch(); await click('Use this annual plan'); await click('Next'); await click('Next'); await step(3) }
function chooseMonth() { fireEvent.click(screen.getByRole('button', { name: 'Select none' })); fireEvent.click(screen.getByRole('checkbox', { name: `Create draft for ${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)} ${year}` })) }
async function openMonth() { const link = await screen.findByRole('link', { name: new RegExp(`${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)} ${year}`) }); fireEvent.click(link); await step(6) }
async function finishMonthly() { await click('Next'); await step(7); await click('Next'); await step(8); await click('Continue budgeting') }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); vi.spyOn(window, 'confirm').mockReturnValue(true)
  annual = { ...annualFixture(), fiscalYearStartYear: year }; options = [{ id: 'budget-a', year, month, status: 'Draft' }]
  vi.mocked(getYearlyPlan).mockImplementation(async (_hh, y, scope) => ({ ...structuredClone(annual), fiscalYearStartYear: y, scope }))
  vi.mocked(getBudgetMonthOptions).mockImplementation(async () => structuredClone(options))
  vi.mocked(getBudget).mockImplementation(async (_hh, y, m, scope) => ({ ...budgetFixture(), id: options.find(item => item.year === y && item.month === m)?.id ?? null, status: options.find(item => item.year === y && item.month === m)?.status ?? null, year: y, month: m, scope }))
  vi.mocked(saveYearlyPlan).mockImplementation(async (_hh, y, scope, startMonth, lines) => {
    annual = { ...annual, id: 'annual-a', fiscalYearStartYear: y, fiscalYearStartMonth: startMonth, scope,
      categories: annual.categories.map(root => ({ ...root, annualTargetAmount: lines.find(line => line.categoryId === root.id)?.annualTargetAmount ?? null,
        children: root.children.map(child => ({ ...child, annualTargetAmount: lines.find(line => line.categoryId === child.id)?.annualTargetAmount ?? null })) })) }; return structuredClone(annual)
  })
  vi.mocked(allocateYearlyPlan).mockImplementation(async (_hh, _year, _scope, periods, replace) => {
    expect(replace).toBe(false); const created = periods.filter(period => !options.some(option => option.year === period.year && option.month === period.month))
    options.push(...created.map(period => ({ ...period, id: 'created-budget', status: 'Draft' as const })))
    return { createdCount: created.length, replacedDraftCount: 0, skippedCount: periods.length - created.length, months: periods.map(period => ({ ...period, result: 'Created', budgetId: options.find(option => option.year === period.year && option.month === period.month)!.id })) }
  })
  vi.mocked(changeBudgetStatus).mockImplementation(async (_hh, id) => { options = options.map(option => option.id === id ? { ...option, status: 'Active' } : option); return { ...budgetFixture(), year, month, status: 'Active' } })
  vi.mocked(saveBudget).mockImplementation(async () => ({ ...budgetFixture(), year, month }))
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({ tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Separate annual-target path under Build your first budget', () => {
  it('offers Quick monthly and annual choices in one card and can finish with saved annual targets only', async () => {
    show(); expect(screen.getByRole('button', { name: 'Quick monthly budget' })).toBeTruthy(); expect(screen.queryByRole('heading', { name: 'Budget from annual targets' })).toBeNull()
    await toImpact(); await click('Finish with annual targets only'); await step(8); await click('Continue annual targets')
    expect(allocateYearlyPlan).not.toHaveBeenCalled(); expect(saveYearlyPlan).not.toHaveBeenCalled(); expect(changeBudgetStatus).not.toHaveBeenCalled()
    expect(saveTutorialProgress).toHaveBeenLastCalledWith('budget-from-annual-targets', 1, 'Completed', 8)
  })
  it.each(['Draft', 'Active', 'Closed'] as const)('opens an existing %s month without allocation, forced edits, activation or reopen', async status => {
    options[0].status = status; show(); await toImpact(); chooseMonth(); await click('Next'); await click('Next'); await step(5); await openMonth(); await finishMonthly()
    expect(allocateYearlyPlan).not.toHaveBeenCalled(); expect(saveBudget).not.toHaveBeenCalled(); expect(changeBudgetStatus).not.toHaveBeenCalled()
  })
  it('creates only the user-selected missing month after the normal allocation confirmation', async () => {
    options = []; show(); await toImpact(); chooseMonth(); await click('Next'); expect(allocateYearlyPlan).not.toHaveBeenCalled()
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Create selected drafts' })); await click('Next'); await openMonth(); await finishMonthly()
    expect(allocateYearlyPlan).toHaveBeenCalledExactlyOnceWith('household-a', year, 'Household', [{ year, month }], false)
  })
  it('honors cancelled allocation and leaves annual-only completion available', async () => {
    options = []; show(); await toImpact(); chooseMonth(); await click('Next'); vi.mocked(window.confirm).mockReturnValue(false); fireEvent.click(screen.getByRole('button', { name: 'Create selected drafts' }))
    expect(allocateYearlyPlan).not.toHaveBeenCalled(); await click('Finish with annual targets only'); await click('Continue annual targets')
  })
  it('preserves Overall/Detailed cancellation, saves an explicit zero, and never forces allocation', async () => {
    annual.categories[0].annualTargetAmount = null; annual.categories[0].children = [{ id: 'rent', name: 'Rent', isActive: true, annualTargetAmount: 1200, equivalentMonthlyAmount: 100, children: [] }]
    show(); await launch(); await click('Use this annual plan'); vi.mocked(window.confirm).mockReturnValue(false); fireEvent.click(screen.getByRole('button', { name: 'Overall' })); expect(screen.getByLabelText('Rent annual target')).toBeTruthy()
    vi.mocked(window.confirm).mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Overall' })); fireEvent.change(screen.getByLabelText('Housing overall annual target'), { target: { value: '0' } }); await click('Next')
    fireEvent.click(screen.getByRole('button', { name: 'Save annual targets' })); await click('Next'); await click('Finish with annual targets only'); await click('Continue annual targets')
    expect(saveYearlyPlan).toHaveBeenCalledWith('household-a', year, 'Household', 1, [{ categoryId: 'housing', annualTargetAmount: 0 }]); expect(allocateYearlyPlan).not.toHaveBeenCalled()
  })
  it('hands off through the actual monthly link once and preserves cancelled navigation without advancing', async () => {
    const view = show(); await toImpact(); chooseMonth(); await click('Next'); await click('Next'); await step(5); view.block(); vi.mocked(window.confirm).mockClear().mockReturnValue(false)
    fireEvent.click(screen.getByRole('link', { name: new RegExp(`${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)} ${year}`) })); expect(window.confirm).toHaveBeenCalledOnce(); await step(5); expect(window.location.pathname).toBe('/budgeting/annual-targets')
    vi.mocked(window.confirm).mockReturnValue(true); await openMonth(); expect(window.confirm).toHaveBeenCalledTimes(2); await finishMonthly()
  })
  it('keeps optional activation on the actual monthly page and verifies the new saved status', async () => {
    show(); await toImpact(); await openMonth(); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Activate' })); await click('Next'); await click('Continue budgeting')
    expect(changeBudgetStatus).toHaveBeenCalledExactlyOnceWith('household-a', 'budget-a', 'activate'); expect(allocateYearlyPlan).not.toHaveBeenCalled()
  })
  it('locks a lost annual-save reply until explicit saved-state read, without saving twice', async () => {
    vi.mocked(saveYearlyPlan).mockRejectedValueOnce(new ApiError('Lost target save reply', 0))
    show(); await launch(); await click('Use this annual plan'); fireEvent.change(screen.getByLabelText('Housing overall annual target'), { target: { value: '2400' } }); await click('Next')
    fireEvent.click(screen.getByRole('button', { name: 'Save annual targets' })); await screen.findByRole('button', { name: 'Check saved annual plan' }); expect((screen.getByRole('button', { name: 'Save annual targets' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved annual plan' })); await click('Next'); await click('Finish with annual targets only'); await click('Continue annual targets'); expect(saveYearlyPlan).toHaveBeenCalledOnce()
  })
  it('reads saved monthly availability after a lost allocation rather than creating again', async () => {
    options = []; vi.mocked(allocateYearlyPlan).mockImplementationOnce(async () => { options.push({ id: 'created-budget', year, month, status: 'Draft' }); throw new ApiError('Lost allocation reply', 0) })
    show(); await toImpact(); chooseMonth(); await click('Next'); fireEvent.click(screen.getByRole('button', { name: 'Create selected drafts' })); await screen.findByRole('button', { name: 'Check saved annual plan' })
    fireEvent.click(screen.getByRole('button', { name: 'Check saved annual plan' })); await click('Next'); await openMonth(); await finishMonthly(); expect(allocateYearlyPlan).toHaveBeenCalledOnce()
  })
  it('fails gracefully for Viewer permissions and stale/wrong plan identity', async () => {
    show('Viewer'); await launch(); expect((within(guide()).getByRole('button', { name: 'Use this annual plan' }) as HTMLButtonElement).disabled).toBe(true); expect(allocateYearlyPlan).not.toHaveBeenCalled()
    const task = { householdId: 'household-a', role: 'Owner', year: 2026, startMonth: 1, scope: 'Household' as const, planId: 'annual-a' }
    const page = { ...task, fresh: true, busy: false, dirty: false, uncertain: false, canManage: true, hasCategories: true, selectedPeriods: ['2026-10'], replaceDrafts: false, budgets: [{ id: 'budget-a', year: 2026, month: 10, status: 'Draft' as const }], allocationRevision: 0, allocationPeriods: [], allocationReplaces: false, allocationReplacedCount: 0 }
    expect(annualBudgetGate(3, 'household-a', 'Owner', task, page, null).canNext).toBe(true)
    for (const changed of [{ ...page, scope: 'Personal' as const }, { ...page, year: 2027 }, { ...page, startMonth: 4 }, { ...page, planId: 'another' }, { ...page, fresh: false }, { ...page, replaceDrafts: true }]) expect(annualBudgetGate(3, 'household-a', 'Owner', task, changed, null).canNext).toBe(false)
  })
})
