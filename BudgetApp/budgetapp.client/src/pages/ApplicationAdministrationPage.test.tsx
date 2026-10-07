import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { authFixture } from '../test/fixtures'
import { AppLink } from '../routing/AppLink'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { ApiError } from '../api/apiClient'
import * as api from '../administration/administrationApi'
import { ApplicationAdministrationPage } from './ApplicationAdministrationPage'

vi.mock('../administration/administrationApi', () => ({ searchAdministrativeAccounts: vi.fn(), getAdministrativeAccount: vi.fn(),
  getAdministrativeAudit: vi.fn(), prepareAdministrativeAction: vi.fn(), resendAdministrativeCode: vi.fn(),
  completeAdministrativeAction: vi.fn(), getAdministrativeResult: vi.fn() }))
const account: api.AdministrativeAccount = { id: 'target-id', displayName: 'Example account', email: 'target@example.test',
  emailConfirmed: true, mfaEnabled: true, lockedUntilUtc: null, version: 'v1', isApplicationAdministrator: false }
const challenge = { challengeId: 'challenge-a', delivered: true, expiresAtUtc: new Date(Date.now() + 300000).toISOString(),
  challengeExpiresAtUtc: new Date(Date.now() + 600000).toISOString(), resendAtUtc: new Date(Date.now() - 1000).toISOString() }
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(api.searchAdministrativeAccounts).mockResolvedValue({ items: [account] })
  vi.mocked(api.getAdministrativeAccount).mockResolvedValue(account)
  vi.mocked(api.getAdministrativeAudit).mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 })
  vi.mocked(api.prepareAdministrativeAction).mockResolvedValue(challenge)
  vi.mocked(api.resendAdministrativeCode).mockResolvedValue(challenge)
  vi.mocked(api.completeAdministrativeAction).mockResolvedValue({ operationId: 'op', outcome: 'EmailSent', message: 'Email sent safely.' })
  vi.mocked(api.getAdministrativeResult).mockResolvedValue({ operationId: 'op', outcome: 'EmailSent', message: 'Recorded email result.' })
})
function Routes() {
  const { path } = useRouter()
  return path === '/admin' ? <><ApplicationAdministrationPage /><AppLink to="/destination">Leave administration</AppLink></> : <p>Destination</p>
}
function show({ admin = true, mfa = true, url = '/admin' } = {}) {
  const auth = authFixture(); auth.user = { ...auth.user!, isApplicationAdministrator: admin, loginVerificationEnabled: mfa }
  window.history.replaceState(null, '', url)
  return render(<RouterProvider><AuthContext.Provider value={auth}><Routes /></AuthContext.Provider></RouterProvider>)
}
async function selected() {
  fireEvent.change(screen.getByLabelText('Email or display name'), { target: { value: 'target' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
  fireEvent.click(await screen.findByRole('button', { name: 'View account target@example.test' }))
  await screen.findByLabelText('Support action')
  await waitFor(() => expect((screen.getByLabelText('Support action') as HTMLSelectElement).disabled).toBe(false))
}
async function prepared() {
  await selected()
  fireEvent.change(screen.getByLabelText('Reason / support reference'), { target: { value: 'User requested support.' } })
  fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'operator current password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request admin MFA code' }))
  fireEvent.change(await screen.findByLabelText('Email verification code'), { target: { value: '001234' } })
}
describe('application administration', () => {
  it('opens a user-directory account link with fresh details and no search or support write', async () => {
    show({ url: '/admin?account=target-id' })
    await screen.findByLabelText('Support action')
    expect(api.getAdministrativeAccount).toHaveBeenCalledExactlyOnceWith('target-id')
    expect(api.searchAdministrativeAccounts).not.toHaveBeenCalled()
    expect(api.prepareAdministrativeAction).not.toHaveBeenCalled(); expect(api.completeAdministrativeAction).not.toHaveBeenCalled()
  })
  it('ends loading and permits explicit retry if the directory-linked account fails to load', async () => {
    vi.mocked(api.getAdministrativeAccount).mockRejectedValueOnce(new Error('Account unavailable')).mockResolvedValueOnce(account)
    show({ url: '/admin?account=target-id' })
    await screen.findByText('Account unavailable')
    expect(screen.queryByText(/Loading selected account/)).toBeNull()
    expect(screen.queryByLabelText('Support action')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByLabelText('Support action')
    expect(api.completeAdministrativeAction).not.toHaveBeenCalled()
  })
  it('does not call privileged APIs for an ordinary user or an operator without MFA', () => {
    const { unmount } = show({ admin: false })
    expect(screen.getByRole('alert').textContent).toMatch(/do not have application-admin access/)
    expect(api.getAdministrativeAudit).not.toHaveBeenCalled(); unmount()
    show({ mfa: false })
    expect(screen.getByRole('link', { name: /Set up MFA/ })).toBeTruthy()
    expect(api.getAdministrativeAudit).not.toHaveBeenCalled()
  })
  it('starts with explicit search, shows only account metadata, and needs fresh authorization before action', async () => {
    show(); await selected()
    expect(api.searchAdministrativeAccounts).toHaveBeenCalledExactlyOnceWith('target')
    expect(screen.getByText('On (email)')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send password-reset email' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.prepareAdministrativeAction).not.toHaveBeenCalled()
    expect(api.completeAdministrativeAction).not.toHaveBeenCalled()
    expect(screen.queryByText('Transactions')).toBeNull()
  })
  it('distinguishes successful empty searches and failed loads without allowing stale actions', async () => {
    vi.mocked(api.searchAdministrativeAccounts).mockResolvedValueOnce({ items: [] }).mockRejectedValueOnce(new Error('Search unavailable'))
    show()
    fireEvent.change(screen.getByLabelText('Email or display name'), { target: { value: 'target' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
    await screen.findByText('No matching accounts.')
    fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
    await screen.findByText('Search unavailable')
    expect(screen.queryByText('No matching accounts.')).toBeNull()
    expect(screen.queryByLabelText('Support action')).toBeNull()
  })
  it('locks approved metadata, supports explicit resend, and canceled confirmation never writes', async () => {
    show(); await prepared()
    expect(api.prepareAdministrativeAction).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 'target-id', action: 'PasswordResetEmail', reason: 'User requested support.', version: 'v1', currentPassword: 'operator current password' }))
    expect((screen.getByLabelText('Reason / support reference') as HTMLTextAreaElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Send password-reset email' }))
    expect(window.confirm).toHaveBeenCalledOnce(); expect(api.completeAdministrativeAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await waitFor(() => expect(api.resendAdministrativeCode).toHaveBeenCalledOnce())
    expect(api.prepareAdministrativeAction).toHaveBeenCalledOnce()
  })
  it('saves once, clears passwords and codes, and uses read-only refresh after completion', async () => {
    show(); await prepared(); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Send password-reset email' }))
    await screen.findByText('Email sent safely.')
    expect(api.completeAdministrativeAction).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('Your current password') as HTMLInputElement).value).toBe('')
    expect(screen.queryByLabelText('Email verification code')).toBeNull()
    await waitFor(() => expect(api.getAdministrativeAccount).toHaveBeenCalledTimes(2))
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain('operator current password')
  })
  it('handles lost responses by checking recorded status, never automatically replaying a mutation', async () => {
    vi.mocked(api.completeAdministrativeAction).mockRejectedValue(new Error('Response lost'))
    show(); await prepared(); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Send password-reset email' }))
    await screen.findByText('Response lost')
    expect((screen.getByLabelText('Your current password') as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('button', { name: 'Request admin MFA code' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check recorded result' }))
    await screen.findByText('Recorded email result.')
    expect(api.completeAdministrativeAction).toHaveBeenCalledOnce(); expect(api.getAdministrativeResult).toHaveBeenCalledOnce()
  })
  it('allows an explicit fresh-proof retry after a definite rejection without retaining credentials or replaying', async () => {
    vi.mocked(api.completeAdministrativeAction).mockRejectedValue(new ApiError('Incorrect MFA code', 400))
    show(); await prepared(); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Send password-reset email' }))
    await screen.findByText('Incorrect MFA code')
    expect(screen.getByText(/The request was rejected; no support action/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check recorded result' })).toBeNull()
    expect((screen.getByLabelText('Reason / support reference') as HTMLTextAreaElement).value).toBe('User requested support.')
    expect((screen.getByLabelText('Your current password') as HTMLInputElement).value).toBe('')
    expect(screen.queryByLabelText('Email verification code')).toBeNull()
    fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'operator current password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request admin MFA code' }))
    await waitFor(() => expect(api.prepareAdministrativeAction).toHaveBeenCalledTimes(2))
    expect(api.completeAdministrativeAction).toHaveBeenCalledOnce()
    expect(api.getAdministrativeResult).not.toHaveBeenCalled()
  })
  it('guards unfinished actions and canceled navigation preserves entered values', async () => {
    show(); await selected()
    fireEvent.change(screen.getByLabelText('Reason / support reference'), { target: { value: 'Unsaved support case.' } })
    fireEvent.click(screen.getByRole('link', { name: 'Leave administration' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/admin')
    expect((screen.getByLabelText('Reason / support reference') as HTMLTextAreaElement).value).toBe('Unsaved support case.')
  })
  it('hides retained directory and audit data when privileged access is revoked', async () => {
    vi.mocked(api.searchAdministrativeAccounts).mockResolvedValueOnce({ items: [account] }).mockRejectedValueOnce(new ApiError('Access removed', 403))
    show()
    fireEvent.change(screen.getByLabelText('Email or display name'), { target: { value: 'target' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
    await screen.findByRole('button', { name: 'View account target@example.test' })
    fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
    await screen.findByText('Access removed')
    expect(screen.queryByRole('button', { name: 'View account target@example.test' })).toBeNull()
  })
  it('does not offer support mutations for designated administrator accounts', async () => {
    vi.mocked(api.getAdministrativeAccount).mockResolvedValue({ ...account, isApplicationAdministrator: true })
    show(); await selectedAdmin()
    expect(screen.getByText(/accounts cannot be changed/)).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Administrative action' })).toBeNull()
    async function selectedAdmin() {
      fireEvent.change(screen.getByLabelText('Email or display name'), { target: { value: 'target' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search accounts' }))
      fireEvent.click(await screen.findByRole('button', { name: 'View account target@example.test' }))
      await screen.findByText(/accounts cannot be changed/)
    }
  })
  it('keeps audit failures distinct from an empty administrative history', async () => {
    vi.mocked(api.getAdministrativeAudit).mockRejectedValue(new Error('Audit unavailable'))
    show(); await screen.findByText('Audit unavailable')
    expect(screen.queryByText('No administrative actions recorded.')).toBeNull()
    expect(within(screen.getByRole('alert', { name: 'administrative audit load status' })).getByRole('button', { name: 'Retry loading' })).toBeTruthy()
  })
})
