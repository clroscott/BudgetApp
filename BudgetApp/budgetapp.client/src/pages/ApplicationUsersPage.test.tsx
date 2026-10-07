import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { ApiError } from '../api/apiClient'
import { getApplicationUsers, type AdministrativeAccount } from '../administration/administrationApi'
import { RouterProvider } from '../routing/RouterProvider'
import { authFixture } from '../test/fixtures'
import { ApplicationUsersPage } from './ApplicationUsersPage'

vi.mock('../administration/administrationApi', () => ({ getApplicationUsers: vi.fn() }))
const account: AdministrativeAccount = { id: 'target-id', displayName: 'Example user', email: 'user@example.test', emailConfirmed: true,
  mfaEnabled: false, lockedUntilUtc: null, version: 'v1', isApplicationAdministrator: false, administratorRole: null }
const page = { items: [account], totalCount: 1, page: 1, pageSize: 20 }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getApplicationUsers).mockResolvedValue(page); window.history.replaceState(null, '', '/admin/users') })
function show({ admin = true, owner = true, mfa = true } = {}) {
  const auth = authFixture(); auth.user = { ...auth.user!, isApplicationAdministrator: admin, isApplicationOwner: owner, loginVerificationEnabled: mfa }
  return render(<RouterProvider><AuthContext.Provider value={auth}><ApplicationUsersPage /></AuthContext.Provider></RouterProvider>)
}
describe('application user directory', () => {
  it('does not load users for ordinary users or password-only sessions', () => {
    const result = show({ admin: false }); expect(screen.getByRole('alert').textContent).toMatch(/access and an MFA/)
    expect(getApplicationUsers).not.toHaveBeenCalled(); result.unmount()
    show({ mfa: false }); expect(getApplicationUsers).not.toHaveBeenCalled()
  })
  it('loads users automatically, labels security metadata and offers direct account links', async () => {
    show(); await screen.findByRole('heading', { name: 'Example user' })
    expect(getApplicationUsers).toHaveBeenCalledExactlyOnceWith(1, '')
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Email ownership')).toBeTruthy(); expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText('MFA')).toBeTruthy(); expect(screen.getByText('Off')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Account support for user@example.test' }).getAttribute('href')).toBe('/admin?account=target-id')
    expect(screen.getByRole('link', { name: 'Manage administrator access for user@example.test' }).getAttribute('href')).toBe('/admin/administrators?account=target-id')
    expect(screen.getByText('1 user registered · Page 1 of 1')).toBeTruthy()
  })
  it('lets support administrators browse users without exposing owner-only management links', async () => {
    show({ owner: false }); await screen.findByRole('heading', { name: 'Example user' })
    expect(screen.getByRole('link', { name: 'Account support for user@example.test' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Manage administrator access/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Administrators' })).toBeNull()
  })
  it('preserves the applied filter across pages and resets to page one when cleared', async () => {
    vi.mocked(getApplicationUsers).mockResolvedValue({ ...page, totalCount: 21 })
    show(); await screen.findByRole('heading', { name: 'Example user' })
    fireEvent.change(screen.getByLabelText('Filter by name or email (optional)'), { target: { value: 'user' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filter' }))
    await waitFor(() => expect(getApplicationUsers).toHaveBeenLastCalledWith(1, 'user'))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Next users page' }) as HTMLButtonElement).disabled).toBe(false))
    vi.mocked(getApplicationUsers).mockResolvedValueOnce({ ...page, page: 2, totalCount: 21 })
    fireEvent.click(screen.getByRole('button', { name: 'Next users page' }))
    await screen.findByText('21 users matching the filter · Page 2 of 2')
    expect(getApplicationUsers).toHaveBeenLastCalledWith(2, 'user')
    fireEvent.click(screen.getByRole('button', { name: 'Show all users' }))
    await waitFor(() => expect(getApplicationUsers).toHaveBeenLastCalledWith(1, ''))
    expect((screen.getByLabelText('Filter by name or email (optional)') as HTMLInputElement).value).toBe('')
  })
  it('distinguishes zero matches from a failed initial request and retries only reads', async () => {
    vi.mocked(getApplicationUsers).mockRejectedValueOnce(new Error('Directory unavailable')).mockResolvedValueOnce({ ...page, items: [], totalCount: 0 })
    show(); await screen.findByText('Directory unavailable')
    expect(screen.queryByText('No registered users were returned.')).toBeNull()
    expect(screen.queryByText(/Loading application users/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByText('No registered users were returned.')
    expect(getApplicationUsers).toHaveBeenCalledTimes(2)
  })
  it('retains clearly stale records on refresh failure but disables account shortcuts until refreshed', async () => {
    vi.mocked(getApplicationUsers).mockResolvedValueOnce(page).mockRejectedValueOnce(new Error('Refresh unavailable'))
    show(); await screen.findByRole('heading', { name: 'Example user' })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('Refresh unavailable')
    expect(screen.getByRole('heading', { name: 'Example user' })).toBeTruthy()
    expect(screen.getByText(/Previously loaded data is shown/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Account support for user@example.test' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Next users page' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('hides retained users when app-admin access is revoked', async () => {
    vi.mocked(getApplicationUsers).mockResolvedValueOnce(page).mockRejectedValueOnce(new ApiError('Access removed', 403))
    show(); await screen.findByRole('heading', { name: 'Example user' })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('Access removed')
    expect(screen.queryByRole('heading', { name: 'Example user' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Registered application users' })).toBeNull()
  })
  it('encodes account IDs in shortcuts rather than interpreting them as URL or HTML', async () => {
    const id = 'other?account=a#"><img src=x>'
    vi.mocked(getApplicationUsers).mockResolvedValue({ ...page, items: [{ ...account, id }] })
    show(); await screen.findByRole('heading', { name: 'Example user' })
    const href = screen.getByRole('link', { name: 'Account support for user@example.test' }).getAttribute('href')!
    expect(href).toBe(`/admin?account=${encodeURIComponent(id)}`)
    expect(document.querySelector('img')).toBeNull()
  })
})
