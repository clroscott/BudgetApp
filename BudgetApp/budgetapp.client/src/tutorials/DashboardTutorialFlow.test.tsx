import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { authFixture, budgetFixture, householdsFixture } from '../test/fixtures'
import { getDashboardLayout, saveDashboardLayout, resetDashboardLayout } from '../dashboard/dashboardLayoutApi'
import { readDashboardSnapshot } from '../dashboard/dashboardSnapshot'
import { DashboardPage } from '../pages/DashboardPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { deferred } from '../test/deferred'
import { dashboardTutorialGate } from './dashboardTutorialState'

vi.mock('../dashboard/dashboardLayoutApi', () => ({ getDashboardLayout: vi.fn(), saveDashboardLayout: vi.fn(), resetDashboardLayout: vi.fn() }))
vi.mock('../dashboard/dashboardSnapshot', async original => ({ ...await original<typeof import('../dashboard/dashboardSnapshot')>(), readDashboardSnapshot: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
let layout = { preferredColumnCount: 3, visiblePanelKeys: ['financial-overview', 'needs-attention', 'quick-actions'], isDefault: false }
function Routes() {
  const { path } = useRouter()
  const tutorials = useTutorials()
  return <>{path === '/dashboard' ? <><DashboardPage /><AppLink to="/tutorials">Leave dashboard</AppLink></> : <TutorialHubPage />}
    <output data-testid="step">{tutorials.activeTutorial ? tutorials.activeStepIndex : 'inactive'}</output>
    {!tutorials.activeTutorial && <button onClick={() => void tutorials.start('customize-dashboard')}>Start dashboard guide</button>}
  </>
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials')
  const households = householdsFixture(); households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}>
    <TutorialProvider><Routes /></TutorialProvider>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Customize your Dashboard tutorial controls' })
async function click(name: string) {
  const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function toEditing() {
  fireEvent.click(screen.getByRole('button', { name: 'Start dashboard guide' }))
  await step(0)
  fireEvent.click(await screen.findByRole('button', { name: 'Customize dashboard' }))
  await click('Next'); await step(1)
}
async function toSave() { await click('Next'); await click('Next'); await click('Next'); await step(4) }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout()
  layout = { preferredColumnCount: 3, visiblePanelKeys: ['financial-overview', 'needs-attention', 'quick-actions'], isDefault: false }
  vi.mocked(getDashboardLayout).mockImplementation(async () => structuredClone(layout))
  vi.mocked(saveDashboardLayout).mockImplementation(async (_hh, request) => { layout = { ...request, isDefault: false }; return structuredClone(layout) })
  vi.mocked(resetDashboardLayout).mockImplementation(async () => structuredClone(layout))
  vi.mocked(readDashboardSnapshot).mockResolvedValue({ budget: { ...budgetFixture(), budgetedAmount: 100, actualAmount: 0, remainingAmount: 100 },
    readyForReviewCount: 0, uncategorizedSpendingCount: 0, hasActiveAccount: true, hasVisibleTransactions: true, recent: null })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)

describe('Dashboard customization guided setup', () => {
  it.each(['Owner', 'Viewer'] as const)('keeps the existing %s layout without a forced preference write or reset', async role => {
    show(role); await toEditing(); await toSave()
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await click('Next'); await step(5); await click('Continue to Dashboard')
    expect(window.location.pathname).toBe('/dashboard')
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('customize-dashboard', 1, 'Completed', 5))
    expect(saveDashboardLayout).not.toHaveBeenCalled(); expect(resetDashboardLayout).not.toHaveBeenCalled()
  })
  it('adds, orders, changes columns and explicitly saves once', async () => {
    show(); await toEditing()
    fireEvent.click(screen.getByRole('button', { name: '+ Recent transactions' }))
    await click('Next'); await step(2)
    fireEvent.click(screen.getByRole('button', { name: 'Move Recent transactions earlier' }))
    await click('Next'); await step(3)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    await click('Next'); await step(4)
    expect(saveDashboardLayout).not.toHaveBeenCalled(); expect(resetDashboardLayout).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }))
    await click('Next'); await step(5); await click('Return to tutorials')
    expect(saveDashboardLayout).toHaveBeenCalledExactlyOnceWith('household-a', { preferredColumnCount: 2,
      visiblePanelKeys: ['financial-overview', 'needs-attention', 'recent-transactions', 'quick-actions'] })
  })
  it('reconciles a lost save response instead of permitting another save or reset', async () => {
    show(); await toEditing(); fireEvent.click(screen.getByRole('button', { name: '2' })); await toSave()
    vi.mocked(saveDashboardLayout).mockImplementationOnce(async (_hh, request) => {
      layout = { ...request, isDefault: false }; throw new Error('Synthetic lost save response')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }))
    const check = await screen.findByRole('button', { name: 'Check saved layout' })
    expect((screen.getByRole('button', { name: 'Save layout' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Reset to default' }) as HTMLButtonElement).disabled).toBe(true)
    vi.mocked(window.confirm).mockReturnValue(true); fireEvent.click(check)
    await click('Next'); await click('Continue to Dashboard')
    expect(saveDashboardLayout).toHaveBeenCalledOnce(); expect(resetDashboardLayout).not.toHaveBeenCalled()
  })
  it('keeps dirty choices on Escape and retains the normal navigation guard', async () => {
    show(); await toEditing(); fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.getByTestId('step').textContent).toBe('inactive')
    expect(screen.getByRole('button', { name: '2' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('link', { name: 'Leave dashboard' }))
    expect(window.confirm).toHaveBeenCalledOnce(); expect(window.location.pathname).toBe('/dashboard')
    expect(saveDashboardLayout).not.toHaveBeenCalled()
  })
  it('does not treat a pending or failed layout read as a successful default', async () => {
    const pending = deferred<typeof layout>(); vi.mocked(getDashboardLayout).mockReturnValueOnce(pending.promise)
    show(); fireEvent.click(screen.getByRole('button', { name: 'Start dashboard guide' })); await step(0)
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => pending.reject(new Error('Synthetic load failure')))
    expect(screen.queryByRole('button', { name: 'Customize dashboard' })).toBeNull()
    expect(saveDashboardLayout).not.toHaveBeenCalled(); expect(resetDashboardLayout).not.toHaveBeenCalled()
  })
  it('blocks changed household/role and busy or uncertain states', () => {
    const page = { householdId: 'hh', fresh: true, hasLayout: true, editing: false, dirty: false, busy: false, uncertain: false }
    const task = { householdId: 'hh', role: 'Viewer' }
    expect(dashboardTutorialGate(5, 'hh', 'Viewer', task, page).canNext).toBe(true)
    expect(dashboardTutorialGate(5, 'hh', 'Admin', task, page).canNext).toBe(false)
    expect(dashboardTutorialGate(5, 'other', 'Viewer', task, page).canNext).toBe(false)
    expect(dashboardTutorialGate(5, 'hh', 'Viewer', task, { ...page, uncertain: true }).canNext).toBe(false)
    expect(dashboardTutorialGate(5, 'hh', 'Viewer', task, { ...page, busy: true }).canNext).toBe(false)
  })
})
