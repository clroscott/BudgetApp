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
import { getBudget, getBudgetMonthOptions, copyBudget, changeBudgetStatus, createBudget, deleteDraftBudget, type BudgetPageData } from '../budgets/budgetApi'
import { getYearlyPlan, saveYearlyPlan, allocateYearlyPlan } from '../budgets/yearlyPlanApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { lifecycleGate } from './lifecycleTutorialState'
import { ApiError } from '../api/apiClient'
vi.mock('../budgets/budgetApi', async original => ({ ...await original<typeof import('../budgets/budgetApi')>(), getBudget: vi.fn(), getBudgetMonthOptions: vi.fn(), copyBudget: vi.fn(), changeBudgetStatus: vi.fn(), saveBudget: vi.fn(), createBudget: vi.fn(), deleteDraftBudget: vi.fn() }))
vi.mock('../budgets/yearlyPlanApi', async original => ({ ...await original<typeof import('../budgets/yearlyPlanApi')>(), getYearlyPlan: vi.fn(), saveYearlyPlan: vi.fn(), allocateYearlyPlan: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1
let saved: BudgetPageData
function Routes() { const { path } = useRouter(); const tutorial = useTutorials(); return <>{path === '/budgeting' ? <BudgetManagementPage /> : path === '/budgeting/annual-targets' ? <YearlyPlanManagementPage /> : <TutorialHubPage />}<output data-testid="step">{tutorial.activeTutorial ? tutorial.activeStepIndex : 'inactive'}</output></> }
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}><TutorialProvider><Routes /></TutorialProvider></HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Copy, reopen or replace budgets tutorial controls' })
async function click(name: string) { const button = await within(guide()).findByRole('button', { name }) as HTMLButtonElement; await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button) }
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function launch() {
  const card = screen.getByRole('heading', { name: 'Copy, reopen or replace budgets' }).closest('article')!, button = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); await step(0)
}
async function start(mode: 'copy' | 'reopen' | 'return') { await launch(); await click(mode === 'copy' ? 'Copy a budget' : mode === 'reopen' ? 'Reopen a Closed budget' : 'Return to Draft / replace'); await click('Use this month'); await step(2) }
async function finish() { await click('Continue budgeting'); await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('budget-lifecycle', 1, 'Completed', 6)) }
async function noReplacement() { await click('Next'); await step(3); await click('Keep current amounts'); await step(6); await finish() }
async function replacement() {
  await click('Next'); await click('Inspect Draft replacement'); await step(4); await screen.findByRole('button', { name: 'Select none' })
  fireEvent.click(screen.getByRole('button', { name: 'Select none' })); fireEvent.click(screen.getByRole('checkbox', { name: `Create draft for ${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)} ${year}` }))
  fireEvent.click(screen.getByLabelText('Replace amounts in existing Draft budgets after confirmation')); await click('Next'); await step(5)
}
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); vi.spyOn(window, 'confirm').mockReturnValue(true)
  saved = { ...budgetFixture(), year, month }
  vi.mocked(getBudget).mockImplementation(async (_hh, y, m, scope) => ({ ...structuredClone(saved), year: y, month: m, scope }))
  vi.mocked(getBudgetMonthOptions).mockImplementation(async () => [{ id: 'source-budget', year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1, status: 'Active' }, ...(saved.id ? [{ id: saved.id, year, month, status: saved.status! }] : [])])
  vi.mocked(copyBudget).mockImplementation(async () => { saved = { ...saved, id: 'copied-budget', status: 'Draft' }; return structuredClone(saved) })
  vi.mocked(changeBudgetStatus).mockImplementation(async (_hh, _id, action) => { saved.status = action === 'return-to-draft' ? 'Draft' : 'Active'; return structuredClone(saved) })
  vi.mocked(getYearlyPlan).mockImplementation(async (_hh, y, scope) => ({ ...annualFixture(), fiscalYearStartYear: y, scope }))
  vi.mocked(allocateYearlyPlan).mockImplementation(async (_hh, _year, _scope, months) => { saved.categories[0].budgetedAmount = 200; return { createdCount: 0, replacedDraftCount: 1, skippedCount: 0, months: months.map(period => ({ ...period, result: 'Replaced', budgetId: saved.id })) } })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({ tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Independent budget lifecycle choices', () => {
  it('copies only on the real Copy button and cannot overwrite an existing destination', async () => {
    saved.id = null; saved.status = null; show(); await start('copy'); expect(copyBudget).not.toHaveBeenCalled()
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Copy selected month' })); await noReplacement(); expect(copyBudget).toHaveBeenCalledOnce(); expect(createBudget).not.toHaveBeenCalled(); expect(saveYearlyPlan).not.toHaveBeenCalled()
  })
  it('lets an existing destination finish unchanged with no copy or delete', async () => {
    show(); await start('copy'); expect(screen.queryByRole('button', { name: 'Copy selected month' })).toBeNull(); await noReplacement(); expect(copyBudget).not.toHaveBeenCalled(); expect(deleteDraftBudget).not.toHaveBeenCalled()
  })
  it('offers a no-change finish when an absent copy destination should stay absent', async () => {
    saved.id = null; saved.status = null; show(); await start('copy'); await click('Keep checked saved state'); await finish(); expect(copyBudget).not.toHaveBeenCalled()
  })
  it('reopens a Closed budget only after the normal confirmation', async () => {
    saved.status = 'Closed'; show(); await start('reopen'); vi.mocked(window.confirm).mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen budget' })); expect(changeBudgetStatus).not.toHaveBeenCalled(); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen budget' })); await noReplacement(); expect(changeBudgetStatus).toHaveBeenCalledExactlyOnceWith('household-a', 'budget-a', 'reopen')
  })
  it('does not repeat Reopen on an already editable budget', async () => {
    saved.status = 'Active'; show(); await start('reopen'); await noReplacement(); expect(changeBudgetStatus).not.toHaveBeenCalled()
  })
  it('returns Active to Draft without requiring replacement, deletion or ledger changes', async () => {
    saved.status = 'Active'; show(); await start('return'); fireEvent.click(screen.getByRole('button', { name: 'Return to draft' })); await noReplacement()
    expect(changeBudgetStatus).toHaveBeenCalledExactlyOnceWith('household-a', 'budget-a', 'return-to-draft'); expect(allocateYearlyPlan).not.toHaveBeenCalled(); expect(deleteDraftBudget).not.toHaveBeenCalled()
  })
  it('honors replacement cancellation and keeps current saved amounts', async () => {
    show(); await start('return'); await replacement(); vi.mocked(window.confirm).mockReturnValue(false); fireEvent.click(screen.getByRole('button', { name: 'Create selected drafts' }))
    expect(allocateYearlyPlan).not.toHaveBeenCalled(); await click('Keep checked saved state'); await step(6); await finish(); expect(saved.categories[0].budgetedAmount).toBe(100)
  })
  it('confirms replacement of only the selected original Draft, reads it again, and does not reallocate on Back', async () => {
    show(); await start('return'); await replacement(); expect(allocateYearlyPlan).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Create selected drafts' }))
    await click('Next'); await step(6); await click('Back'); await step(5); await click('Next'); await finish()
    expect(allocateYearlyPlan).toHaveBeenCalledExactlyOnceWith('household-a', year, 'Household', [{ year, month }], true); expect(saved.categories[0].budgetedAmount).toBe(200); expect(saveYearlyPlan).not.toHaveBeenCalled(); expect(createBudget).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain('budget-a')
  })
  it('checks an uncertain allocation against saved data rather than automatically replacing again', async () => {
    vi.mocked(allocateYearlyPlan).mockRejectedValueOnce(new ApiError('Lost allocation reply', 0))
    show(); await start('return'); await replacement(); fireEvent.click(screen.getByRole('button', { name: 'Create selected drafts' })); await screen.findByRole('button', { name: 'Check saved annual plan' })
    expect((screen.getByRole('button', { name: 'Create selected drafts' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved annual plan' })); await click('Keep checked saved state'); await finish(); expect(allocateYearlyPlan).toHaveBeenCalledOnce()
  })
  it('reconciles a lost Copy reply through a fresh month read and never copies twice', async () => {
    saved.id = null; saved.status = null; vi.mocked(copyBudget).mockImplementationOnce(async () => { saved.id = 'copied-budget'; saved.status = 'Draft'; throw new ApiError('Lost copy reply', 0) })
    show(); await start('copy'); fireEvent.click(screen.getByRole('button', { name: 'Copy selected month' })); await screen.findByText('Lost copy reply')
    fireEvent.click(screen.getByRole('button', { name: 'Check saved budget' })); await noReplacement(); expect(copyBudget).toHaveBeenCalledOnce()
  })
  it('does not grant Viewer write access or manufacture a plan for a status exercise', async () => {
    show('Viewer'); await launch(); expect((within(guide()).getByRole('button', { name: 'Copy a budget' }) as HTMLButtonElement).disabled).toBe(true)
    expect(changeBudgetStatus).not.toHaveBeenCalled(); expect(createBudget).not.toHaveBeenCalled()
  })
  it('binds original budget/context and protects other selected replacement months', () => {
    const task = { householdId: 'household-a', role: 'Owner', mode: 'return' as const, year: 2026, month: 10, scope: 'Household' as const, budgetId: 'budget-a' }
    const annual = { householdId: 'household-a', year: 2026, startMonth: 1, scope: 'Household' as const, planId: 'annual-a', fresh: true, busy: false, dirty: false, uncertain: false, canManage: true, hasCategories: true,
      selectedPeriods: ['2026-10'], replaceDrafts: true, budgets: [{ id: 'budget-a', year: 2026, month: 10, status: 'Draft' as const }], allocationRevision: 0, allocationPeriods: [], allocationReplaces: false, allocationReplacedCount: 0 }
    expect(lifecycleGate(4, 'household-a', 'Owner', task, null, annual).canNext).toBe(true)
    expect(lifecycleGate(4, 'household-a', 'Owner', task, null, { ...annual, selectedPeriods: ['2026-9', '2026-10'] }).canNext).toBe(false)
    expect(lifecycleGate(4, 'household-a', 'Owner', task, null, { ...annual, budgets: [{ ...annual.budgets[0], status: 'Active' }] }).canNext).toBe(false)
    expect(lifecycleGate(4, 'household-a', 'Viewer', task, null, annual).canNext).toBe(false)
  })
})
