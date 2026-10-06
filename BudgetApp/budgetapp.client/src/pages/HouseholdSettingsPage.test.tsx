import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/apiClient'
import { AuthContext } from '../auth/authContext'
import { AppShell } from '../components/AppShell'
import { HouseholdContext } from '../households/householdContext'
import { getHouseholds, getHouseholdSettings, saveHouseholdSettings, type HouseholdSettings } from '../households/householdApi'
import { HouseholdProvider } from '../households/HouseholdProvider'
import { useHouseholds } from '../households/useHouseholds'
import { PageNavigation } from '../routing/PageNavigation'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { authFixture, household, householdsFixture, otherHousehold } from '../test/fixtures'
import { TutorialContext, type TutorialContextValue } from '../tutorials/tutorialContext'
import { HouseholdSettingsPage } from './HouseholdSettingsPage'

vi.mock('../households/householdApi', async original => ({ ...await original<typeof import('../households/householdApi')>(),
  getHouseholds: vi.fn(), getHouseholdSettings: vi.fn(), saveHouseholdSettings: vi.fn() }))

function data(changes: Partial<HouseholdSettings> = {}): HouseholdSettings {
  return { ...household, fiscalYearStartMonth: 1, version: '2026-10-06T12:00:00+00:00',
    canEdit: true, canChangeCurrency: true, currencyLockedReason: null, ...changes }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function Routes() {
  const { path } = useRouter()
  return path === '/dashboard' ? <main><h1>Destination</h1></main> : <HouseholdSettingsPage />
}
function tutorialFixture(): TutorialContextValue {
  return { activeTutorial: null, activeStepIndex: 0, progress: [], isLoading: false, error: null,
    start: vi.fn(async () => {}), dismiss: vi.fn(async () => {}), exit: vi.fn(async () => {}),
    next: vi.fn(async () => {}), back: vi.fn(async () => {}) }
}
function show(context = householdsFixture()) {
  window.history.replaceState(null, '', '/household/settings')
  return { context, ...render(<RouterProvider><HouseholdContext.Provider value={context}>
    <TutorialContext.Provider value={tutorialFixture()}><PageNavigation><Routes /></PageNavigation></TutorialContext.Provider>
  </HouseholdContext.Provider></RouterProvider>) }
}
async function ready() {
  await waitFor(() => expect((screen.getByLabelText('Household name') as HTMLInputElement).disabled).toBe(false))
  return screen.getByLabelText('Household name') as HTMLInputElement
}
function leave() { fireEvent.click(screen.getByRole('link', { name: 'Return to dashboard' })) }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getHouseholdSettings).mockReset()
  vi.mocked(saveHouseholdSettings).mockReset()
  vi.mocked(getHouseholds).mockReset()
  vi.mocked(getHouseholdSettings).mockResolvedValue(data())
  vi.mocked(saveHouseholdSettings).mockImplementation(async (_id, body) => data({ ...body, version: '2026-10-06T13:00:00+00:00' }))
  vi.mocked(getHouseholds).mockResolvedValue([household, otherHousehold])
})

describe('household settings feedback and editing', () => {
  it('provides the registered title, current section, visible labels and associated default instructions', async () => {
    show()
    await ready()
    expect(document.title).toBe('Household settings | MC Budget')
    expect(screen.getByText(`Shared settings for ${household.name}.`)).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Household pages' })
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Members & invitations' }).getAttribute('aria-current')).toBeNull()
    const fiscal = screen.getByRole('combobox', { name: 'Default fiscal-year starting month' }) as HTMLSelectElement
    expect(fiscal.labels?.[0].textContent).toBe('Default fiscal-year starting month')
    expect(document.getElementById(fiscal.getAttribute('aria-describedby')!)?.textContent).toContain('does not change saved annual plans or existing monthly budgets')
    expect(screen.getByRole('combobox', { name: 'Time zone' }).getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Default currency' }).getAttribute('aria-describedby')).toBeTruthy()
    expect(saveHouseholdSettings).not.toHaveBeenCalled()
    leave()
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it.each(['Owner', 'Admin', 'Editor', 'Viewer'])('shows %s the server-authorized editing state', async role => {
    const editable = ['Owner', 'Admin'].includes(role)
    vi.mocked(getHouseholdSettings).mockResolvedValue(data({ canEdit: editable }))
    const context = householdsFixture()
    context.currentHousehold = { ...household, role }
    show(context)
    await screen.findByLabelText('Household name')
    expect((screen.getByLabelText('Household name') as HTMLInputElement).disabled).toBe(!editable)
    expect((screen.getByLabelText('Default fiscal-year starting month') as HTMLSelectElement).disabled).toBe(!editable)
    if (!editable) {
      expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
      expect(screen.getByText(/You have read-only access/)).toBeTruthy()
    }
    expect(saveHouseholdSettings).not.toHaveBeenCalled()
  })

  it('explains locked currency while allowing name, time zone and fiscal edits', async () => {
    vi.mocked(getHouseholdSettings).mockResolvedValue(data({ canChangeCurrency: false, currencyLockedReason: 'Currency is locked because financial data exists.' }))
    show()
    const name = await ready()
    expect((screen.getByLabelText('Default currency') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText('Currency is locked because financial data exists.')).toBeTruthy()
    fireEvent.change(name, { target: { value: 'Renamed' } })
    expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('stops loading on initial failure and retries reads without suggesting absent settings', async () => {
    vi.mocked(getHouseholdSettings).mockRejectedValueOnce(new Error('Sample read failure'))
    show()
    await screen.findByRole('heading', { name: 'Could not load household settings' })
    expect(screen.queryByText('Loading household settings…')).toBeNull()
    expect(screen.queryByLabelText('Household name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await ready()
    expect(getHouseholdSettings).toHaveBeenCalledTimes(2)
    expect(saveHouseholdSettings).not.toHaveBeenCalled()
  })

  it('marks retained values stale after a refresh failure and disables writing until retry succeeds', async () => {
    show()
    const name = await ready()
    vi.mocked(getHouseholdSettings).mockRejectedValueOnce(new Error('Sample refresh failure'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByRole('heading', { name: 'Could not refresh household settings' })
    expect(name.value).toBe(household.name)
    expect(name.disabled).toBe(true)
    expect(screen.getByText(/Previously loaded data is shown below and may be out of date/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await ready()
    expect(saveHouseholdSettings).not.toHaveBeenCalled()
  })

  it('retains edits on save failure, saves the original version once on retry, then clears protection', async () => {
    vi.mocked(saveHouseholdSettings).mockRejectedValueOnce(new Error('Sample save failure'))
    const { context } = show()
    const name = await ready()
    fireEvent.change(name, { target: { value: 'New shared name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Sample save failure')
    expect(name.value).toBe('New shared name')
    leave()
    expect(window.location.pathname).toBe('/household/settings')
    expect(window.confirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText(/Household settings were saved/)
    expect(saveHouseholdSettings).toHaveBeenCalledTimes(2)
    expect(vi.mocked(saveHouseholdSettings).mock.calls[0]).toEqual(vi.mocked(saveHouseholdSettings).mock.calls[1])
    expect(saveHouseholdSettings).toHaveBeenLastCalledWith(household.id, { name: 'New shared name', defaultCurrency: 'CAD', timeZoneId: household.timeZoneId, fiscalYearStartMonth: 1, version: data().version })
    expect(context.updateHousehold).toHaveBeenCalledExactlyOnceWith({ ...household, name: 'New shared name' })
    expect(context.refresh).not.toHaveBeenCalled()
    expect(getHouseholdSettings).toHaveBeenCalledTimes(1)
    vi.mocked(window.confirm).mockClear()
    leave()
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('prevents duplicate pending writes and exposes saving state without another load', async () => {
    const pending = deferred<HouseholdSettings>()
    vi.mocked(saveHouseholdSettings).mockReturnValueOnce(pending.promise)
    const { container } = show()
    fireEvent.change(await ready(), { target: { value: 'Pending name' } })
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(saveHouseholdSettings).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Saving household settings…').getAttribute('role')).toBe('status')
    await act(async () => pending.resolve(data({ name: 'Pending name' })))
    expect(screen.getByText(/Household settings were saved/)).toBeTruthy()
  })

  it.each([409, 403])('preserves edits after a %s save response and requires an explicit confirmed reload', async status => {
    vi.mocked(saveHouseholdSettings).mockRejectedValueOnce(new ApiError('Sample conflict or permission failure', status))
    show()
    const name = await ready()
    fireEvent.change(name, { target: { value: 'Keep these edits' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Sample conflict or permission failure')
    expect(name.value).toBe('Keep these edits')
    expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    expect(getHouseholdSettings).toHaveBeenCalledTimes(1)
    expect(name.value).toBe('Keep these edits')
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await ready()
    expect(name.value).toBe(household.name)
    expect(saveHouseholdSettings).toHaveBeenCalledTimes(1)
  })

  it('Cancel and Refresh ask before discarding edits, and failed refresh keeps dirty protection', async () => {
    show()
    const name = await ready()
    fireEvent.change(name, { target: { value: 'Dirty name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    expect(name.value).toBe('Dirty name')
    expect(getHouseholdSettings).toHaveBeenCalledTimes(1)
    vi.mocked(window.confirm).mockReturnValue(true)
    vi.mocked(getHouseholdSettings).mockRejectedValueOnce(new Error('Failed confirmed refresh'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('Failed confirmed refresh')
    expect(name.value).toBe('Dirty name')
    vi.mocked(window.confirm).mockReturnValue(false)
    leave()
    expect(window.location.pathname).toBe('/household/settings')
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel changes' }))
    expect(name.value).toBe(household.name)
    expect(saveHouseholdSettings).not.toHaveBeenCalled()
  })

  it('beforeunload protects edited settings but undoing edits returns to clean', async () => {
    show()
    const name = await ready()
    fireEvent.change(name, { target: { value: 'Dirty' } })
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
    fireEvent.change(name, { target: { value: household.name } })
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
  })

  it('hides retained settings after read access is revoked', async () => {
    show()
    await ready()
    vi.mocked(getHouseholdSettings).mockRejectedValueOnce(new ApiError('Access revoked', 403))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('Access revoked')
    expect(screen.queryByLabelText('Household name')).toBeNull()
  })

  it('provides a genuine no-selected-household state without an API call', () => {
    const context = householdsFixture()
    context.currentHousehold = null
    context.households = []
    show(context)
    expect(screen.getByText('Choose or create a household before opening its settings.')).toBeTruthy()
    expect(getHouseholdSettings).not.toHaveBeenCalled()
  })
})

function SettingsWithShell() {
  const { currentHousehold, isLoading } = useHouseholds()
  if (isLoading || !currentHousehold) return <p>Loading sample households</p>
  return <AppShell><HouseholdSettingsPage key={currentHousehold.id} /></AppShell>
}
describe('household settings in the persistent shell', () => {
  it('canceled household switching keeps edits; accepted switching remounts without saving or leaking values', async () => {
    vi.mocked(getHouseholdSettings).mockImplementation(async id => data(id === otherHousehold.id ? { id, name: otherHousehold.name } : {}))
    window.history.replaceState(null, '', '/household/settings')
    render(<RouterProvider><AuthContext.Provider value={authFixture()}><HouseholdProvider><SettingsWithShell /></HouseholdProvider></AuthContext.Provider></RouterProvider>)
    const name = await ready()
    fireEvent.change(name, { target: { value: 'Only household A' } })
    const switcher = screen.getByLabelText('Current household') as HTMLSelectElement
    fireEvent.change(switcher, { target: { value: otherHousehold.id } })
    expect(switcher.value).toBe(household.id)
    expect(name.value).toBe('Only household A')
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(switcher, { target: { value: otherHousehold.id } })
    await waitFor(() => expect((screen.getByLabelText('Household name') as HTMLInputElement).value).toBe(otherHousehold.name))
    expect(saveHouseholdSettings).not.toHaveBeenCalled()
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })
  it('a successful rename updates the current header without reloading away form state or moving selection', async () => {
    window.history.replaceState(null, '', '/household/settings')
    render(<RouterProvider><AuthContext.Provider value={authFixture()}><HouseholdProvider><SettingsWithShell /></HouseholdProvider></AuthContext.Provider></RouterProvider>)
    fireEvent.change(await ready(), { target: { value: 'Renamed household A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText(/Household settings were saved/)
    const switcher = screen.getByLabelText('Current household') as HTMLSelectElement
    expect(switcher.value).toBe(household.id)
    expect(within(switcher).getByRole('option', { name: 'Renamed household A' })).toBeTruthy()
    expect(getHouseholds).toHaveBeenCalledTimes(1)
    expect(getHouseholdSettings).toHaveBeenCalledTimes(1)
  })
})
