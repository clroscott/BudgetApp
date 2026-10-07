import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/apiClient'
import { confirmEmail, resendConfirmation } from '../auth/authApi'
import { AuthContext } from '../auth/authContext'
import { EmailVerificationNotice } from '../components/EmailVerificationNotice'
import { HouseholdContext } from '../households/householdContext'
import { getHouseholdInvitationPreview, getPendingHouseholdInvitations } from '../households/householdInvitationApi'
import { RouterProvider } from '../routing/RouterProvider'
import { authFixture, householdsFixture } from '../test/fixtures'
import { EmailConfirmationPage } from './EmailConfirmationPage'
import { HouseholdInvitationAcceptancePage } from './HouseholdInvitationAcceptancePage'
import { HouseholdSetupPage } from './HouseholdSetupPage'
import { RegisterPage } from './RegisterPage'
import { ResendConfirmationPage } from './ResendConfirmationPage'

vi.mock('../auth/authApi', async original => ({ ...await original<typeof import('../auth/authApi')>(),
  confirmEmail: vi.fn(), resendConfirmation: vi.fn(),
}))
vi.mock('../households/householdInvitationApi', async original => ({
  ...await original<typeof import('../households/householdInvitationApi')>(),
  getHouseholdInvitationPreview: vi.fn(), getPendingHouseholdInvitations: vi.fn(),
}))
function unverified() {
  const auth = authFixture()
  auth.user = { ...auth.user!, emailConfirmed: false }
  return auth
}
function show(page: ReactNode, auth = unverified(), url = '/confirm-email?userId=test-user&token=proof') {
  window.history.replaceState(null, '', url)
  render(<RouterProvider><AuthContext.Provider value={auth}>
    <HouseholdContext.Provider value={householdsFixture()}>{page}</HouseholdContext.Provider>
  </AuthContext.Provider></RouterProvider>)
  return auth
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(confirmEmail).mockResolvedValue(authFixture().user!)
  vi.mocked(resendConfirmation).mockResolvedValue({ message: 'If the address can be confirmed, check your inbox. Wait one minute.' })
  vi.mocked(getPendingHouseholdInvitations).mockResolvedValue([])
  vi.mocked(getHouseholdInvitationPreview).mockResolvedValue({ householdName: 'Private household', inviterDisplayName: 'Private inviter',
    maskedEmail: 's***@example.test', role: 'Viewer', expiresAtUtc: '2026-12-01T00:00:00Z', isAvailable: true, status: 'Pending' })
})

describe('email ownership pages', () => {
  it('does not automatically consume a confirmation link; explicitly confirms and cleans its URL', async () => {
    const auth = show(<EmailConfirmationPage />)
    expect(confirmEmail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm email address' }))
    await screen.findByRole('heading', { name: 'Email confirmed' })
    expect(confirmEmail).toHaveBeenCalledExactlyOnceWith('test-user', 'proof', false)
    expect(auth.updateUser).toHaveBeenCalledWith(authFixture().user)
    expect(window.location.search).toBe('')
  })
  it('requires sign-in without requesting confirmation for anonymous visitors', () => {
    const auth = unverified(); auth.user = null
    show(<EmailConfirmationPage />, auth)
    expect(screen.getByRole('link', { name: 'Sign in to confirm' }).getAttribute('href')).toContain('returnTo=')
    expect(confirmEmail).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirm email address' })).toBeNull()
  })
  it('explains a wrong account and lets the user explicitly switch accounts', async () => {
    const auth = show(<EmailConfirmationPage />, unverified(), '/confirm-email?userId=someone-else&token=proof')
    expect(screen.getByText(/link belongs to a different account/)).toBeTruthy()
    expect(confirmEmail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with another account' }))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(window.location.search).toContain('returnTo=')
  })
  it('handles incomplete links without an API call', () => {
    show(<EmailConfirmationPage />, unverified(), '/confirm-email')
    expect(screen.getByText(/link is incomplete/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Request confirmation' })).toBeTruthy()
    expect(confirmEmail).not.toHaveBeenCalled()
  })
  it('does not try to consume an old link again for the already confirmed matching account', () => {
    show(<EmailConfirmationPage />, authFixture())
    expect(screen.getByRole('status').textContent).toContain('already confirmed')
    expect(screen.getByRole('link', { name: 'Continue to your household' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm email address' })).toBeNull()
    expect(confirmEmail).not.toHaveBeenCalled()
  })
  it('preserves a failed link for safe explicit retry and prevents concurrent submits', async () => {
    vi.mocked(confirmEmail).mockRejectedValueOnce(new Error('Link expired. Request a new link.'))
    show(<EmailConfirmationPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm email address' }))
    await screen.findByText('Link expired. Request a new link.')
    expect(window.location.search).toContain('token=proof')
    let finish!: () => void
    vi.mocked(confirmEmail).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(authFixture().user!) }))
    const button = screen.getByRole('button', { name: 'Confirm email address' })
    fireEvent.click(button); fireEvent.click(button)
    expect(confirmEmail).toHaveBeenCalledTimes(2)
    expect(button.hasAttribute('disabled')).toBe(true)
    finish()
    await screen.findByRole('heading', { name: 'Email confirmed' })
  })
  it('uses the reusable change-email completion endpoint and explains that the old address is retained', async () => {
    show(<EmailConfirmationPage />, unverified(), '/confirm-email-change?userId=test-user&token=new-address-proof')
    expect(screen.getByText(/old address remains in use until confirmation succeeds/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm email address' }))
    await screen.findByRole('heading', { name: 'Email confirmed' })
    expect(confirmEmail).toHaveBeenCalledExactlyOnceWith('test-user', 'new-address-proof', true)
  })
  it('requires sign-in to resend and never prompts for another person’s email', () => {
    const auth = unverified(); auth.user = null
    show(<ResendConfirmationPage />, auth, '/resend-confirmation')
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
  it('provides an explicit resend path for existing accounts without sending on mount', async () => {
    show(<ResendConfirmationPage />, unverified(), '/resend-confirmation?returnTo=%2Fhousehold%2Fsetup')
    expect(resendConfirmation).not.toHaveBeenCalled()
    expect(screen.getByText('sample@example.test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }))
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(resendConfirmation).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('note', { name: 'Your data is safe' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Back to your previous page' })).toBeNull()
  })
  it('does not send again for an already confirmed account', () => {
    show(<ResendConfirmationPage />, authFixture(), '/resend-confirmation')
    expect(screen.getByRole('status').textContent).toContain('already confirmed')
    expect(screen.queryByRole('button', { name: 'Send confirmation link' })).toBeNull()
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
  it('lets users refresh confirmation status from another tab without sending another email', async () => {
    const auth = show(<ResendConfirmationPage />, unverified(), '/resend-confirmation')
    fireEvent.click(screen.getByRole('button', { name: 'Check confirmation status' }))
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1))
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
  it('keeps sign-out and recovery available while access is blocked', async () => {
    const auth = show(<ResendConfirmationPage />, unverified(), '/verify-email')
    expect(screen.getByRole('link', { name: 'Recover your account' }).getAttribute('href')).toBe('/forgot-password')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
  it('restores the intended return path only after confirmation', () => {
    show(<ResendConfirmationPage />, authFixture(), '/verify-email?returnTo=%2Fhousehold%2Fsetup')
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/household/setup')
  })
  it('stops loading and keeps a retry action after a resend failure', async () => {
    vi.mocked(resendConfirmation).mockRejectedValueOnce(new Error('Too many requests. Try again shortly.'))
    show(<ResendConfirmationPage />, unverified(), '/resend-confirmation')
    fireEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }))
    await screen.findByText('Too many requests. Try again shortly.')
    const retry = screen.getByRole('button', { name: 'Send confirmation link' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    fireEvent.click(retry)
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(resendConfirmation).toHaveBeenCalledTimes(2)
  })
  function fillRegistration() {
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Sample user' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sample@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long test password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a long test password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)
  }
  it('signs in with the just-entered credentials and preserves the invitation destination at the verification gate', async () => {
    const auth = unverified()
    vi.mocked(auth.login).mockResolvedValue(auth.user!)
    show(<RegisterPage />, auth, '/register?returnTo=%2Fhousehold-invitations%2Faccept%3Ftoken%3Dinvite')
    fillRegistration()
    await waitFor(() => expect(window.location.pathname).toBe('/verify-email'))
    expect(auth.register).toHaveBeenCalledTimes(1)
    expect(auth.login).toHaveBeenCalledExactlyOnceWith({ email: 'sample@example.test', password: 'a long test password', rememberMe: false })
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/household-invitations/accept?token=invite')
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
  it('keeps registration guidance generic when automatic credential sign-in is rejected', async () => {
    const auth = unverified()
    auth.user = null
    vi.mocked(auth.login).mockRejectedValue(new ApiError('The email address or password is incorrect.', 401))
    show(<RegisterPage />, auth, '/register?returnTo=%2Fhousehold-invitations%2Faccept%3Ftoken%3Dinvite')
    fillRegistration()
    await screen.findByRole('heading', { name: 'Check your email' })
    await waitFor(() => expect(auth.login).toHaveBeenCalledTimes(1))
    expect(auth.register).toHaveBeenCalledTimes(1)
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/register')
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0].getAttribute('href')).toContain('returnTo=%2Fhousehold-invitations')
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByText('The email address or password is incorrect.')).toBeNull()
  })
  it('provides a manual sign-in fallback if the registration succeeds but sign-in is unavailable', async () => {
    const auth = unverified()
    vi.mocked(auth.login).mockRejectedValue(new ApiError('Unable to connect. Please try again.'))
    show(<RegisterPage />, auth, '/register')
    fillRegistration()
    await screen.findByText('Unable to connect. Please try again.')
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeTruthy()
    expect(window.location.pathname).toBe('/register')
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0)
    expect(auth.register).toHaveBeenCalledTimes(1)
  })
  it('uses normal credential checks for an already verified existing address and returns directly to the intended page', async () => {
    const auth = authFixture()
    show(<RegisterPage />, auth, '/register?returnTo=%2Fbudgeting%3Fscope%3DPersonal')
    fillRegistration()
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/budgeting?scope=Personal'))
    expect(auth.login).toHaveBeenCalledTimes(1)
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
})

describe('invitation privacy in the interface', () => {
  it('does not query or reveal email-matched invitations during unverified household setup', () => {
    show(<HouseholdSetupPage />, unverified(), '/household/setup')
    expect(getPendingHouseholdInvitations).not.toHaveBeenCalled()
    expect(screen.getByRole('note', { name: 'Email confirmation required' })).toBeTruthy()
    expect(screen.queryByText('Checking for invitations...')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create household' })).toBeNull()
  })
  it.each([false, true])('does not preview an invitation for an anonymous/unverified visitor (signed in: %s)', signedIn => {
    const auth = unverified(); if (!signedIn) auth.user = null
    show(<HouseholdInvitationAcceptancePage />, auth, '/household-invitations/accept?token=secret')
    expect(getHouseholdInvitationPreview).not.toHaveBeenCalled()
    expect(screen.queryByText('Private household')).toBeNull()
    expect(screen.queryByText('Loading invitation…')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull()
    expect(screen.getByRole('link', { name: signedIn ? 'Send a confirmation link' : 'Sign in' })).toBeTruthy()
  })
  it('loads an invitation only after confirmation', async () => {
    show(<HouseholdInvitationAcceptancePage />, authFixture(), '/household-invitations/accept?token=secret')
    await screen.findByText('Private household')
    expect(getHouseholdInvitationPreview).toHaveBeenCalledExactlyOnceWith('secret')
    expect(screen.getByRole('button', { name: 'Accept invitation' })).toBeTruthy()
  })
  it('provides a clear recovery path after a verified invitation load fails', async () => {
    vi.mocked(getHouseholdInvitationPreview).mockRejectedValueOnce(new Error('Invitation unavailable'))
    show(<HouseholdInvitationAcceptancePage />, authFixture(), '/household-invitations/accept?token=secret')
    await screen.findByText('Invitation unavailable')
    expect(screen.queryByText('Loading invitation…')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading invitation' }))
    await screen.findByText('Private household')
    expect(getHouseholdInvitationPreview).toHaveBeenCalledTimes(2)
  })
  it('does not show the verification banner for a confirmed account', () => {
    show(<EmailVerificationNotice />, authFixture())
    expect(screen.queryByRole('note')).toBeNull()
  })
})
