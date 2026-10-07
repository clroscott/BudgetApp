import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/apiClient'
import { changePassword, getAccountSettings, saveDisplayName, type AccountSettings } from '../auth/accountSettingsApi'
import { requestEmailChange, resendConfirmation } from '../auth/authApi'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { HouseholdProvider } from '../households/HouseholdProvider'
import { getHouseholds } from '../households/householdApi'
import { AppShell } from '../components/AppShell'
import { PageNavigation } from '../routing/PageNavigation'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { authFixture, householdsFixture, household, otherHousehold } from '../test/fixtures'
import { TutorialContext } from '../tutorials/tutorialContext'
import { AccountSettingsPage } from './AccountSettingsPage'

vi.mock('../auth/accountSettingsApi', () => ({ getAccountSettings: vi.fn(), saveDisplayName: vi.fn(), changePassword: vi.fn() }))
vi.mock('../auth/authApi', async original => ({ ...await original<typeof import('../auth/authApi')>(), requestEmailChange: vi.fn(), resendConfirmation: vi.fn() }))
vi.mock('../households/householdApi', async original => ({ ...await original<typeof import('../households/householdApi')>(), getHouseholds: vi.fn() }))
function data(changes: Partial<AccountSettings> = {}): AccountSettings {
  return { user: authFixture().user!, pendingEmailChange: null, version: 'version-1', ...changes }
}
const pendingReplacement = { email: 'replacement@example.test', requestedAtUtc: '2026-10-06T12:00:00Z', expiresAtUtc: '2026-10-06T13:00:00Z', isExpired: false }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function Routes({ shell = false }: { shell?: boolean }) {
  const { path } = useRouter()
  if (path !== '/settings/account') return <main><h1>Destination</h1></main>
  return shell ? <AppShell><AccountSettingsPage /></AppShell> : <AccountSettingsPage />
}
function show({ auth = authFixture(), households = householdsFixture(), shell = false } = {}) {
  window.history.replaceState(null, '', '/settings/account')
  const tutorial = { activeTutorial: null, activeStepIndex: 0, progress: [], isLoading: false, error: null,
    start: vi.fn(async () => {}), dismiss: vi.fn(async () => {}), exit: vi.fn(async () => {}), next: vi.fn(async () => {}), back: vi.fn(async () => {}) }
  return { auth, households, ...render(<RouterProvider><AuthContext.Provider value={auth}><HouseholdContext.Provider value={households}>
    <TutorialContext.Provider value={tutorial}><PageNavigation><Routes shell={shell} /></PageNavigation></TutorialContext.Provider>
  </HouseholdContext.Provider></AuthContext.Provider></RouterProvider>) }
}
async function ready() {
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement).disabled).toBe(false))
  return screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement
}
function typeEmail() {
  fireEvent.change(screen.getByLabelText('New email address'), { target: { value: pendingReplacement.email } })
  fireEvent.change(screen.getByLabelText('Current password for email change'), { target: { value: 'existing long password' } })
}
function typePassword(confirm = 'a new long test password') {
  fireEvent.change(screen.getByLabelText('Current password for password change'), { target: { value: 'existing long password' } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a new long test password' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAccountSettings).mockReset().mockResolvedValue(data())
  vi.mocked(saveDisplayName).mockReset().mockImplementation(async name => data({ user: { ...authFixture().user!, displayName: name }, version: 'version-2' }))
  vi.mocked(changePassword).mockReset().mockResolvedValue(undefined)
  vi.mocked(requestEmailChange).mockReset().mockResolvedValue({ message: 'If eligible, check your inbox. Wait one minute.' })
  vi.mocked(resendConfirmation).mockReset().mockResolvedValue({ message: 'Check your inbox.' })
  vi.mocked(getHouseholds).mockReset().mockResolvedValue([household, otherHousehold])
})

describe('personal account settings', () => {
  it('shows labeled independent forms, current email, explicit verification and the registered page title', async () => {
    show()
    await ready()
    expect(document.title).toBe('Account settings | MC Budget')
    expect(screen.getByRole('form', { name: 'Display name' })).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Request an email change' })).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Password' })).toBeTruthy()
    expect(screen.getByText('Current email')).toBeTruthy()
    expect(screen.getByText(authFixture().user!.email)).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText('No replacement email has been requested.')).toBeTruthy()
    expect((screen.getByLabelText('New password') as HTMLInputElement).getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText(/not added to shared household activity/)).toBeTruthy()
    expect(requestEmailChange).not.toHaveBeenCalled()
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
  it('works without a household and directs back to setup instead of requiring membership', async () => {
    const households = householdsFixture(); households.currentHousehold = null; households.households = []
    show({ households })
    await ready()
    expect(screen.getByRole('link', { name: 'Return to household setup' }).getAttribute('href')).toBe('/household/setup')
    expect(screen.getByRole('button', { name: 'Save display name' })).toBeTruthy()
  })
  it('allows unverified users to correct their address or explicitly resend, without loading financial data', async () => {
    const auth = authFixture(); auth.user = { ...auth.user!, emailConfirmed: false }
    vi.mocked(getAccountSettings).mockResolvedValue(data({ user: auth.user }))
    show({ auth })
    await ready()
    expect(screen.getByText(/Not verified/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return to confirmation' }).getAttribute('href')).toBe('/verify-email')
    expect(resendConfirmation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send current-email confirmation' }))
    await screen.findByText('Check your inbox.')
    expect(resendConfirmation).toHaveBeenCalledTimes(1)
  })
  it('stops initial loading after a failure and only retries the read', async () => {
    vi.mocked(getAccountSettings).mockRejectedValueOnce(new Error('Read unavailable'))
    show()
    await screen.findByRole('heading', { name: 'Could not load account settings' })
    expect(screen.queryByText('Loading account settings…')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Display name' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await ready()
    expect(getAccountSettings).toHaveBeenCalledTimes(2)
    expect(saveDisplayName).not.toHaveBeenCalled()
  })
  it('marks a failed refresh as stale and disables saves until recovered', async () => {
    show(); await ready()
    vi.mocked(getAccountSettings).mockRejectedValueOnce(new Error('Refresh unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByRole('heading', { name: 'Could not refresh account settings' })
    expect(screen.getByText(authFixture().user!.email)).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await ready()
  })
  it('saves only the display name, updates auth context, and keeps another form’s edits protected', async () => {
    const { auth } = show()
    fireEvent.change(await ready(), { target: { value: 'Updated name' } })
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: pendingReplacement.email } })
    fireEvent.click(screen.getByRole('button', { name: 'Save display name' }))
    await screen.findByText('Display name saved.')
    expect(saveDisplayName).toHaveBeenCalledExactlyOnceWith('Updated name', 'version-1')
    expect(auth.updateUser).toHaveBeenLastCalledWith({ ...authFixture().user!, displayName: 'Updated name' })
    expect((screen.getByLabelText('New email address') as HTMLInputElement).value).toBe(pendingReplacement.email)
    fireEvent.click(screen.getByRole('link', { name: 'Return to dashboard' }))
    expect(window.location.pathname).toBe('/settings/account')
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(requestEmailChange).not.toHaveBeenCalled()
    expect(changePassword).not.toHaveBeenCalled()
  })
  it('prevents double submits and keeps a successful profile save clean', async () => {
    const pending = deferred<AccountSettings>()
    vi.mocked(saveDisplayName).mockReturnValueOnce(pending.promise)
    show(); fireEvent.change(await ready(), { target: { value: 'Pending name' } })
    const form = screen.getByRole('form', { name: 'Display name' })
    fireEvent.submit(form); fireEvent.submit(form)
    expect(saveDisplayName).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Saving display name…').getAttribute('role')).toBe('status')
    await act(async () => pending.resolve(data({ user: { ...authFixture().user!, displayName: 'Pending name' }, version: 'version-2' })))
    await screen.findByText('Display name saved.')
    fireEvent.click(screen.getByRole('link', { name: 'Return to dashboard' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/dashboard')
  })
  it('retains a conflicting name and asks before reloading instead of silently overwriting it', async () => {
    vi.mocked(saveDisplayName).mockRejectedValueOnce(new ApiError('Changed in another tab', 409))
    show(); const name = await ready()
    fireEvent.change(name, { target: { value: 'Keep my name edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save display name' }))
    await screen.findByText('Changed in another tab')
    expect(name.value).toBe('Keep my name edit')
    expect((screen.getByRole('button', { name: 'Save display name' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    expect(getAccountSettings).toHaveBeenCalledTimes(1)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await ready()
    expect(name.value).toBe(authFixture().user!.displayName)
  })
  it('protects canceled navigation, refresh/close, and undo-to-clean without persisting values', async () => {
    show(); const name = await ready()
    fireEvent.change(name, { target: { value: 'Unsaved' } })
    const before = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('link', { name: 'Return to dashboard' }))
    expect(name.value).toBe('Unsaved')
    fireEvent.change(name, { target: { value: authFixture().user!.displayName } })
    const after = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
    expect(localStorage.length).toBe(0)
  })
  it('shows pending and expired replacement addresses distinctly from the verified current address', async () => {
    vi.mocked(getAccountSettings).mockResolvedValue(data({ pendingEmailChange: { ...pendingReplacement, isExpired: true } }))
    show(); await ready()
    const pending = screen.getByRole('note', { name: 'Pending email replacement' })
    expect(within(pending).getByText(pendingReplacement.email)).toBeTruthy()
    expect(within(pending).getByText(/request has expired/)).toBeTruthy()
    expect(screen.getByText(authFixture().user!.email)).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(requestEmailChange).not.toHaveBeenCalled()
  })
  it('uses the existing email-change flow and refreshes pending details without changing the current email', async () => {
    show(); const name = await ready()
    fireEvent.change(name, { target: { value: 'Independent unsaved name' } })
    typeEmail()
    vi.mocked(getAccountSettings).mockResolvedValue(data({ pendingEmailChange: pendingReplacement, version: 'version-after-request' }))
    fireEvent.click(screen.getByRole('button', { name: 'Request email change' }))
    await screen.findByRole('note', { name: 'Pending email replacement' })
    expect(requestEmailChange).toHaveBeenCalledExactlyOnceWith(pendingReplacement.email, 'existing long password')
    expect(screen.getByText(authFixture().user!.email)).toBeTruthy()
    expect(name.value).toBe('Independent unsaved name')
    expect((screen.getByLabelText('Current password for email change') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Save display name' }))
    await screen.findByText('Display name saved.')
    expect(saveDisplayName).toHaveBeenCalledWith('Independent unsaved name', 'version-1')
  })
  it('keeps a confirmed email request’s success after its refresh fails and never repeats the write on read retry', async () => {
    show(); await ready(); typeEmail()
    vi.mocked(getAccountSettings).mockRejectedValueOnce(new Error('Read after write failed')).mockResolvedValue(data({ pendingEmailChange: pendingReplacement }))
    fireEvent.click(screen.getByRole('button', { name: 'Request email change' }))
    await screen.findByText(/Email-change request submitted/)
    await screen.findByRole('heading', { name: 'Could not refresh account settings' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByRole('note', { name: 'Pending email replacement' })
    expect(requestEmailChange).toHaveBeenCalledTimes(1)
  })
  it('retains safe edits but clears the email password after a failed request', async () => {
    vi.mocked(requestEmailChange).mockRejectedValueOnce(new ApiError('Check your current password', 400))
    show(); fireEvent.change(await ready(), { target: { value: 'Safe name edit' } }); typeEmail()
    fireEvent.click(screen.getByRole('button', { name: 'Request email change' }))
    await screen.findByText('Check your current password')
    expect((screen.getByLabelText('New email address') as HTMLInputElement).value).toBe(pendingReplacement.email)
    expect((screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement).value).toBe('Safe name edit')
    expect((screen.getByLabelText('Current password for email change') as HTMLInputElement).value).toBe('')
    expect(localStorage.length).toBe(0)
    expect(JSON.stringify(sessionStorage)).not.toContain('existing long password')
    fireEvent.click(screen.getByRole('link', { name: 'Return to dashboard' }))
    expect(window.location.pathname).toBe('/settings/account')
  })
  it('requires matching new passwords without calling the backend and clears sensitive values', async () => {
    show(); await ready(); typePassword('does not match')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await screen.findByText(/new passwords do not match/)
    expect(changePassword).not.toHaveBeenCalled()
    for (const name of ['Current password for password change', 'New password', 'Confirm new password'])
      expect((screen.getByLabelText(name) as HTMLInputElement).value).toBe('')
  })
  it('clears password fields after a failed save while retaining safe edits in other sections', async () => {
    vi.mocked(changePassword).mockRejectedValueOnce(new Error('Password change failed'))
    show(); fireEvent.change(await ready(), { target: { value: 'Keep this name' } }); typePassword()
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await screen.findByText('Password change failed')
    expect((screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement).value).toBe('Keep this name')
    for (const name of ['Current password for password change', 'New password', 'Confirm new password'])
      expect((screen.getByLabelText(name) as HTMLInputElement).value).toBe('')
    expect(localStorage.length).toBe(0)
  })
  it('changes the password independently, reports session behavior and prevents duplicate writes', async () => {
    const pending = deferred<void>(); vi.mocked(changePassword).mockReturnValueOnce(pending.promise)
    show(); await ready(); typePassword()
    const form = screen.getByRole('form', { name: 'Password' })
    fireEvent.submit(form); fireEvent.submit(form)
    expect(changePassword).toHaveBeenCalledExactlyOnceWith('existing long password', 'a new long test password')
    await act(async () => pending.resolve())
    await screen.findByText(/Password changed. You remain signed in/)
    expect(saveDisplayName).not.toHaveBeenCalled()
    expect(requestEmailChange).not.toHaveBeenCalled()
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('')
  })
  it('supports confirmed clearing of only one form and guarded standalone sign-out', async () => {
    const { auth } = show(); await ready(); typeEmail()
    fireEvent.click(screen.getByRole('button', { name: 'Clear email form' }))
    expect((screen.getByLabelText('New email address') as HTMLInputElement).value).toBe(pendingReplacement.email)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(auth.logout).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Clear email form' }))
    expect((screen.getByLabelText('New email address') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
    expect(window.location.pathname).toBe('/login')
  })
  it('exposes current-page navigation and blocks canceled sidebar navigation with pending account edits', async () => {
    const { households } = show({ shell: true })
    fireEvent.change(await ready(), { target: { value: 'Unsaved personal name' } })
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Account settings' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(nav).getByRole('link', { name: 'Dashboard' }))
    expect(window.location.pathname).toBe('/settings/account')
    expect(screen.getByRole('combobox', { name: 'Current household' })).toBeTruthy()
    expect(households.currentHousehold?.id).toBe(household.id)
    expect(otherHousehold.id).not.toBe(household.id)
  })
  it('guards real household switching and retains account edits because they are not household-specific', async () => {
    window.history.replaceState(null, '', '/settings/account')
    render(<RouterProvider><AuthContext.Provider value={authFixture()}><HouseholdProvider>
      <Routes shell />
    </HouseholdProvider></AuthContext.Provider></RouterProvider>)
    const name = await ready()
    fireEvent.change(name, { target: { value: 'My account edit' } })
    const selector = await screen.findByRole('combobox', { name: 'Current household' }) as HTMLSelectElement
    fireEvent.change(selector, { target: { value: otherHousehold.id } })
    expect(selector.value).toBe(household.id)
    expect(name.value).toBe('My account edit')
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(selector, { target: { value: otherHousehold.id } })
    expect(selector.value).toBe(otherHousehold.id)
    expect(name.value).toBe('My account edit')
    expect(getAccountSettings).toHaveBeenCalledTimes(1)
    expect(saveDisplayName).not.toHaveBeenCalled()
  })
})
