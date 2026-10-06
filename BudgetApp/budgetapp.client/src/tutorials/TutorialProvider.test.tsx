import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { AppShell } from '../components/AppShell'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { authFixture, householdsFixture } from '../test/fixtures'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { getTutorialProgress, saveTutorialProgress, type TutorialProgress } from './tutorialProgressApi'
import { tutorialDefinitions } from './tutorialDefinitions'
import type { TutorialContextValue } from './tutorialContext'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'

vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
function saved(status: TutorialProgress['status'] = 'InProgress', currentStepIndex = 0): TutorialProgress {
  return { tutorialKey: 'getting-started', tutorialVersion: 1, status, currentStepIndex,
    startedAtUtc: '2026-10-06T00:00:00Z', updatedAtUtc: '2026-10-06T00:00:00Z', completedAtUtc: null, dismissedAtUtc: null }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function show({ dirty = false } = {}) {
  let controls!: TutorialContextValue
  let setDirty!: (value: boolean) => void
  let auth = authFixture()
  function Page() {
    controls = useTutorials()
    const { path } = useRouter()
    const [isDirty, setIsDirty] = useState(dirty)
    setDirty = setIsDirty
    useUnsavedChangesGuard(isDirty, 'Discard corrections?')
    const targetId = path === '/dashboard' ? 'dashboard-welcome' : path === '/accounts' ? 'accounts-page-title'
      : path === '/budgeting' ? 'monthly-budget-page-title' : path === '/import' ? 'csv-import-page-title' : 'tutorial-hub'
    return <main><div data-tutorial-id={targetId}><h1>{path}</h1></div>
      {!controls.activeTutorial && <button onClick={() => void controls.start('getting-started')}>Start tour</button>}
      <output data-testid="index">{controls.activeTutorial ? controls.activeStepIndex : 'inactive'}</output>
      {controls.error && !controls.activeTutorial && <p role="alert">{controls.error}</p>}
    </main>
  }
  window.history.replaceState(null, '', '/tutorials')
  const contents = () => <AuthContext.Provider value={auth}><RouterProvider>
    <HouseholdContext.Provider value={householdsFixture()}><TutorialProvider><AppShell><Page /></AppShell></TutorialProvider></HouseholdContext.Provider>
  </RouterProvider></AuthContext.Provider>
  const result = render(contents())
  return { ...result, controls: () => controls, setDirty: (next: boolean) => act(() => setDirty(next)),
    setUser: (id: string) => { auth = { ...auth, user: { ...auth.user!, id } }; result.rerender(contents()) } }
}
async function flush() { await act(async () => { await Promise.resolve() }) }
async function start() { fireEvent.click(screen.getByRole('button', { name: 'Start tour' })); await flush() }
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('index').textContent).toBe(String(index))) }

beforeEach(() => {
  vi.clearAllMocks()
  mockTutorialLayout()
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (_key, _version, status, index) => saved(status, index))
})
afterEach(restoreTutorialLayout)

describe('tutorial provider, real routing, and navigation shell', () => {
  it('completes the existing tour using actual sidebar links, then replays from the beginning', async () => {
    show()
    await start()
    await step(0)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await step(1)
    fireEvent.click(screen.getByRole('link', { name: 'Accounts' }))
    await step(2)
    expect(window.location.pathname).toBe('/accounts')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Manage financial accounts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await step(1)
    expect(window.location.pathname).toBe('/dashboard')
    fireEvent.click(screen.getByRole('link', { name: 'Accounts' }))
    await step(2)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await step(3)
    fireEvent.click(screen.getByRole('link', { name: 'Monthly budget' }))
    await step(4)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await step(5)
    fireEvent.click(screen.getByRole('link', { name: 'Import transactions' }))
    await step(6)
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(screen.getByTestId('index').textContent).toBe('inactive'))
    expect(window.location.pathname).toBe('/tutorials')
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('getting-started', 1, 'Completed', 6))
    await start()
    await step(0)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your starting point' }))
  })

  it.each([760, 800, 880, 600])('opens the real AppShell menu when its navigation is rendered hidden at %spx', async width => {
    vi.mocked(Object.getOwnPropertyDescriptor(window, 'innerWidth')!.get!).mockReturnValue(width)
    const original = vi.mocked(HTMLElement.prototype.getBoundingClientRect).getMockImplementation()!
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // Model the CSS closed menu, and the real AppShell state change that reveals it.
      if (this.closest('.sidebar-navigation') && !this.closest('.app-sidebar.open')) {
        return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
      }
      return original.call(this)
    })
    show()
    await start()
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await step(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('true'))
    expect(screen.getByRole('button', { name: 'Go to highlighted control' })).toBeTruthy()
    expect(saveTutorialProgress).toHaveBeenLastCalledWith('getting-started', 1, 'InProgress', 1)
  })

  it('keeps the real desktop sidebar collapse preference intact', async () => {
    localStorage.setItem('budgetapp.sidebar-collapsed.test-user', 'true')
    const { container } = show()
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await step(1)
    expect(container.querySelector('.app-sidebar.collapsed')).toBeTruthy()
    expect(localStorage.getItem('budgetapp.sidebar-collapsed.test-user')).toBe('true')
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('does not advance a canceled route click or prompt again; confirmed navigation advances normally', async () => {
    const view = show()
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await step(1)
    view.setDirty(true)
    fireEvent.click(screen.getByRole('link', { name: 'Accounts' }))
    await new Promise(resolve => window.setTimeout(resolve, 10))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/dashboard')
    expect(screen.getByTestId('index').textContent).toBe('1')
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('link', { name: 'Accounts' }))
    await step(2)
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })

  it('Exit/Escape remove the overlay immediately even while progress saving is pending', async () => {
    const pending = deferred<TutorialProgress>()
    vi.mocked(saveTutorialProgress).mockReturnValueOnce(pending.promise)
    show()
    await start()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Getting started tutorial controls' })).toBeNull()
    expect(screen.getByTestId('index').textContent).toBe('inactive')
    expect(saveTutorialProgress).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(saved()))
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('region', { name: 'Getting started tutorial controls' })).toBeNull()
  })

  it('serializes delayed checkpoints so newer step and exit saves cannot be overwritten', async () => {
    const pending = deferred<TutorialProgress>()
    vi.mocked(saveTutorialProgress).mockReturnValueOnce(pending.promise)
    const view = show()
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await step(1)
    fireEvent.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(screen.queryByRole('region', { name: 'Getting started tutorial controls' })).toBeNull()
    expect(saveTutorialProgress).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(saved()))
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenCalledTimes(3))
    expect(vi.mocked(saveTutorialProgress).mock.calls.map(call => [call[2], call[3]])).toEqual([
      ['InProgress', 0], ['InProgress', 1], ['InProgress', 1],
    ])
    expect(view.controls().progress[0].currentStepIndex).toBe(1)
  })

  it('keeps failed progress saving separate from navigation, allows Exit, and resumes a saved checkpoint', async () => {
    vi.mocked(getTutorialProgress).mockResolvedValue([saved('InProgress', 3)])
    const view = show()
    await waitFor(() => expect(view.controls().progress.length).toBe(1))
    vi.mocked(saveTutorialProgress).mockRejectedValue(new Error('Unable to save tutorial progress.'))
    await act(async () => { await view.controls().start('getting-started', true) })
    await step(3)
    expect(window.location.pathname).toBe('/accounts')
    expect(screen.getByRole('alert').textContent).toContain('still continue or exit')
    fireEvent.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(screen.queryByRole('region', { name: 'Getting started tutorial controls' })).toBeNull()
    await flush()
    expect(screen.getByRole('button', { name: 'Start tour' })).toBeTruthy()
  })

  it('ignores a late initial progress load after a newer checkpoint save', async () => {
    const loading = deferred<TutorialProgress[]>()
    vi.mocked(getTutorialProgress).mockReturnValue(loading.promise)
    const view = show()
    await start()
    expect(view.controls().progress[0].currentStepIndex).toBe(0)
    await act(async () => loading.resolve([saved('Completed', 6)]))
    expect(view.controls().progress[0].status).toBe('InProgress')
  })

  it('does not execute queued checkpoints from a previous sign-in session', async () => {
    const pending = deferred<TutorialProgress>()
    vi.mocked(saveTutorialProgress).mockReturnValueOnce(pending.promise)
    const view = show()
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(saveTutorialProgress).toHaveBeenCalledTimes(1)
    view.setUser('another-user')
    await flush()
    await start()
    expect(saveTutorialProgress).toHaveBeenCalledTimes(2)
    await act(async () => pending.resolve(saved()))
    await flush()
    expect(saveTutorialProgress).toHaveBeenCalledTimes(2)
    expect(view.controls().progress[0].currentStepIndex).toBe(0)
  })

  it('preserves stable tutorial IDs, kind, version, and the existing seven-step tour', () => {
    const tutorial = tutorialDefinitions[0]
    expect([tutorial.key, tutorial.version, tutorial.kind]).toEqual(['getting-started', 1, 'LearnOnly'])
    expect(tutorial.steps.map(step => step.targetId)).toEqual(['dashboard-welcome', 'nav-accounts', 'accounts-page-title', 'nav-monthly-budget', 'monthly-budget-page-title', 'nav-import', 'csv-import-page-title'])
  })
})
