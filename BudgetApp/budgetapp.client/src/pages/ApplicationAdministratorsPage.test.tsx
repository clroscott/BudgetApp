import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { ApiError } from '../api/apiClient'
import * as api from '../administration/administrationApi'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { authFixture } from '../test/fixtures'
import { ApplicationAdministratorsPage } from './ApplicationAdministratorsPage'

vi.mock('../administration/administrationApi', () => ({ getApplicationAdministrators: vi.fn(), searchAdministrativeAccounts: vi.fn(),
  getAdministrativeAccount: vi.fn(), prepareAdministrativeAction: vi.fn(), resendAdministrativeCode: vi.fn(),
  completeAdministrativeAction: vi.fn(), getAdministrativeResult: vi.fn() }))
const account: api.AdministrativeAccount = { id: 'target-id', displayName: 'Example account', email: 'target@example.test', emailConfirmed: true,
  mfaEnabled: true, lockedUntilUtc: null, version: 'account-v1', isApplicationAdministrator: false, administratorRole: null, administratorVersion: null }
const owner = { ...account, id: 'owner-id', email: 'owner@example.test', displayName: 'Installation owner', administratorRole: 'InstallationOwner' as const, administratorVersion: 'grant-v1', isApplicationAdministrator: true }
const challenge = { challengeId: 'challenge', delivered: true, expiresAtUtc: new Date(Date.now() + 300000).toISOString(),
  resendAtUtc: new Date(Date.now() - 1000).toISOString(), challengeExpiresAtUtc: new Date(Date.now() + 600000).toISOString() }
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(api.getApplicationAdministrators).mockResolvedValue({ items: [owner], totalCount: 1, page: 1, pageSize: 20 })
  vi.mocked(api.searchAdministrativeAccounts).mockResolvedValue({ items: [account] })
  vi.mocked(api.getAdministrativeAccount).mockResolvedValue(account)
  vi.mocked(api.prepareAdministrativeAction).mockResolvedValue(challenge)
  vi.mocked(api.resendAdministrativeCode).mockResolvedValue(challenge)
  vi.mocked(api.completeAdministrativeAction).mockResolvedValue({ operationId: 'op', outcome: 'Succeeded', message: 'Access updated safely.' })
  vi.mocked(api.getAdministrativeResult).mockResolvedValue({ operationId: 'op', outcome: 'Succeeded', message: 'Recorded access change.' })
})
function Routes() {
  const { path } = useRouter()
  return path === '/admin/administrators' ? <ApplicationAdministratorsPage /> : <p>Account support destination</p>
}
function show(isOwner = true, url = '/admin/administrators') {
  const auth = authFixture(); auth.user = { ...auth.user!, id: 'owner-id', isApplicationOwner: isOwner, isApplicationAdministrator: true, loginVerificationEnabled: true }
  auth.updateUser = vi.fn(); window.history.replaceState(null, '', url)
  render(<RouterProvider><AuthContext.Provider value={auth}><Routes /></AuthContext.Provider></RouterProvider>)
  return auth
}
async function select() {
  await screen.findByRole('button', { name: 'Manage access for owner@example.test' })
  fireEvent.change(screen.getByLabelText('Email or display name'), { target: { value: 'target' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Select account target@example.test' }))
  await screen.findByLabelText('New application access')
  await waitFor(() => expect((screen.getByLabelText('Your current password') as HTMLInputElement).disabled).toBe(false))
}
async function prepare() {
  await select()
  fireEvent.change(screen.getByLabelText('Reason / access reference'), { target: { value: 'Authorized support role.' } })
  fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'current secret password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request access-change MFA code' }))
  fireEvent.change(await screen.findByLabelText('Email verification code'), { target: { value: '001234' } })
}
describe('application administrator management', () => {
  it('opens a directory-linked account with fresh role/version data without searching or granting', async () => {
    show(true, '/admin/administrators?account=target-id')
    await screen.findByLabelText('New application access')
    expect(api.getAdministrativeAccount).toHaveBeenCalledExactlyOnceWith('target-id')
    expect(api.searchAdministrativeAccounts).not.toHaveBeenCalled()
    expect(api.prepareAdministrativeAction).not.toHaveBeenCalled(); expect(api.completeAdministrativeAction).not.toHaveBeenCalled()
  })
  it('does not call management APIs for support administrators', () => {
    show(false)
    expect(screen.getByRole('alert').textContent).toMatch(/Only installation owners/)
    expect(api.getApplicationAdministrators).not.toHaveBeenCalled(); expect(api.searchAdministrativeAccounts).not.toHaveBeenCalled()
  })
  it('shows named roles and current section, and loads fresh status before changing access', async () => {
    show(); await select()
    expect(screen.getByRole('link', { name: 'Administrators' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('No administrator access', { selector: 'strong' })).toBeTruthy()
    expect(api.getAdministrativeAccount).toHaveBeenCalledExactlyOnceWith('target-id')
    expect(api.completeAdministrativeAction).not.toHaveBeenCalled()
  })
  it('binds approval to account and grant versions, locks details, and canceled confirmation never grants', async () => {
    show(); await prepare()
    expect(api.prepareAdministrativeAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'GrantSupportAccess', targetUserId: 'target-id', version: 'account-v1', grantVersion: null, reason: 'Authorized support role.' }))
    expect((screen.getByLabelText('New application access') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm access change' }))
    expect(window.confirm).toHaveBeenCalledOnce(); expect(api.completeAdministrativeAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await waitFor(() => expect(api.resendAdministrativeCode).toHaveBeenCalledOnce())
  })
  it('saves once, clears credentials and refreshes reads without restarting the app', async () => {
    show(); await prepare(); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm access change' }))
    await screen.findByText('Access updated safely.')
    expect(api.completeAdministrativeAction).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('Your current password') as HTMLInputElement).value).toBe('')
    expect(screen.queryByLabelText('Email verification code')).toBeNull()
    await waitFor(() => expect(api.getApplicationAdministrators).toHaveBeenCalledTimes(2))
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain('current secret password')
  })
  it('preserves the access reason after a definite rejection but requires a new password and proof', async () => {
    vi.mocked(api.completeAdministrativeAction).mockRejectedValue(new ApiError('Last owner must remain', 409))
    show(); await prepare(); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm access change' }))
    await screen.findByText('Last owner must remain')
    expect((screen.getByLabelText('Reason / access reference') as HTMLTextAreaElement).value).toBe('Authorized support role.')
    expect((screen.getByLabelText('Your current password') as HTMLInputElement).value).toBe('')
    expect(screen.queryByLabelText('Email verification code')).toBeNull()
    expect(api.completeAdministrativeAction).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Check recorded result' })).toBeNull()
  })
  it('checks lost-response results with GET instead of replaying grants', async () => {
    vi.mocked(api.completeAdministrativeAction).mockRejectedValue(new Error('Lost response'))
    show(); await prepare(); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm access change' }))
    await screen.findByText('Lost response')
    expect((screen.getByRole('button', { name: 'Request access-change MFA code' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check recorded result' }))
    await screen.findByText('Recorded access change.')
    expect(api.completeAdministrativeAction).toHaveBeenCalledOnce(); expect(api.getAdministrativeResult).toHaveBeenCalledOnce()
  })
  it('guards reason edits when navigating between administration sections', async () => {
    show(); await select()
    fireEvent.change(screen.getByLabelText('Reason / access reference'), { target: { value: 'Keep this request.' } })
    fireEvent.click(screen.getByRole('link', { name: 'Account support' }))
    expect(window.confirm).toHaveBeenCalledOnce(); expect(window.location.pathname).toBe('/admin/administrators')
    expect((screen.getByLabelText('Reason / access reference') as HTMLTextAreaElement).value).toBe('Keep this request.')
  })
  it('does not describe a failed administrator list as an empty installation', async () => {
    vi.mocked(api.getApplicationAdministrators).mockRejectedValue(new Error('List unavailable'))
    show(); await screen.findByText('List unavailable')
    expect(screen.queryByText(/No application-administrator grants were returned/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry loading' })).toBeTruthy()
  })
  it('explains missing MFA and disables granting access', async () => {
    vi.mocked(api.getAdministrativeAccount).mockResolvedValue({ ...account, mfaEnabled: false })
    show(); await screen.findByRole('button', { name: 'Manage access for owner@example.test' })
    fireEvent.change(screen.getByLabelText('Email or display name'), { target: { value: 'target' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Select account target@example.test' }))
    await screen.findByText(/This account must confirm its email/)
    expect((screen.getByRole('button', { name: 'Request access-change MFA code' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
