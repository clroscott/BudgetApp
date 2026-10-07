import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { getCurrentUser, login, logout, register } from './authApi'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import { authFixture } from '../test/fixtures'
import { ResendConfirmationPage } from '../pages/ResendConfirmationPage'
import { RegisterPage } from '../pages/RegisterPage'
import { RouterProvider } from '../routing/RouterProvider'

vi.mock('./authApi', async original => ({ ...await original<typeof import('./authApi')>(),
  getCurrentUser: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(), resendConfirmation: vi.fn(),
}))
const verified = authFixture().user!
const unverified = { ...verified, emailConfirmed: false }
function SessionProbe() {
  const { user, isLoading, updateUser, logout: signOut } = useAuth()
  const [draft, setDraft] = useState('unsaved value')
  return <>
    <p>{isLoading ? 'Loading session' : user ? `${user.email}: ${user.emailConfirmed ? 'verified' : 'unverified'}` : 'Signed out'}</p>
    <input aria-label="Unrelated edit" value={draft} onChange={event => setDraft(event.target.value)} />
    <button onClick={() => updateUser(verified)}>Complete confirmation</button>
    <button onClick={() => void signOut()}>Log out test session</button>
  </>
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockReset()
  vi.mocked(getCurrentUser).mockResolvedValue(unverified)
  vi.mocked(login).mockResolvedValue(unverified)
  vi.mocked(logout).mockResolvedValue(undefined)
  vi.mocked(register).mockResolvedValue({ message: 'Check your email.' })
  window.history.replaceState(null, '', '/verify-email?returnTo=%2Fbudgeting%3Fscope%3DPersonal')
})

describe('verification session continuity', () => {
  it('quietly updates status when returning from an email tab without resetting edits or focus', async () => {
    render(<AuthProvider><SessionProbe /></AuthProvider>)
    await screen.findByText(`${verified.email}: unverified`)
    const input = screen.getByRole('textbox', { name: 'Unrelated edit' })
    fireEvent.change(input, { target: { value: 'Keep my edit' } })
    input.focus()
    vi.mocked(getCurrentUser).mockResolvedValue(verified)
    fireEvent(window, new Event('focus'))
    await screen.findByText(`${verified.email}: verified`)
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('Keep my edit')
    expect(document.activeElement).toBe(input)
    expect(screen.queryByText('Loading session')).toBeNull()
    expect(login).not.toHaveBeenCalled()
  })
  it('returns the waiting page to Continue without another login, preserving the original destination', async () => {
    render(<RouterProvider><AuthProvider><ResendConfirmationPage /></AuthProvider></RouterProvider>)
    await screen.findByRole('button', { name: 'Check confirmation status' })
    vi.mocked(getCurrentUser).mockResolvedValue(verified)
    fireEvent(document, new Event('visibilitychange'))
    const link = await screen.findByRole('link', { name: 'Continue' })
    expect(link.getAttribute('href')).toBe('/budgeting?scope=Personal')
    expect(login).not.toHaveBeenCalled()
  })
  it('retains the session on a temporary status-check failure and retries when focus returns', async () => {
    render(<AuthProvider><SessionProbe /></AuthProvider>)
    await screen.findByText(`${verified.email}: unverified`)
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValue(verified)
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(2))
    expect(screen.getByText(`${verified.email}: unverified`)).toBeTruthy()
    fireEvent(window, new Event('focus'))
    await screen.findByText(`${verified.email}: verified`)
  })
  it('does not duplicate an in-flight check or downgrade a freshly confirmed user with its stale response', async () => {
    render(<AuthProvider><SessionProbe /></AuthProvider>)
    await screen.findByText(`${verified.email}: unverified`)
    let complete!: (value: typeof unverified) => void
    vi.mocked(getCurrentUser).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    // The unverified status can render before the passive focus listener is installed.
    // Establish the pending request before exercising stale-response behavior.
    await waitFor(() => {
      fireEvent(window, new Event('focus'))
      expect(getCurrentUser).toHaveBeenCalledTimes(2)
    })
    fireEvent(document, new Event('visibilitychange'))
    expect(getCurrentUser).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Complete confirmation' }))
    await act(async () => complete(unverified))
    expect(screen.getByText(`${verified.email}: verified`)).toBeTruthy()
  })
  it('does not restore a signed-out session from a pending background check', async () => {
    render(<AuthProvider><SessionProbe /></AuthProvider>)
    await screen.findByText(`${verified.email}: unverified`)
    let complete!: (value: typeof unverified) => void
    vi.mocked(getCurrentUser).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await waitFor(() => {
      fireEvent(window, new Event('focus'))
      expect(getCurrentUser).toHaveBeenCalledTimes(2)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log out test session' }))
    await screen.findByText('Signed out')
    await act(async () => complete(verified))
    expect(screen.getByText('Signed out')).toBeTruthy()
  })
  it('signs in after registration without retaining the password in browser storage', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    window.history.replaceState(null, '', '/register?returnTo=%2Fhousehold-invitations%2Faccept%3Ftoken%3Dinvite')
    const initialLocalStorage = JSON.stringify(localStorage)
    const initialSessionStorage = JSON.stringify(sessionStorage)
    render(<RouterProvider><AuthProvider><RegisterPage /><SessionProbe /></AuthProvider></RouterProvider>)
    await screen.findByText('Signed out')
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Sample user' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: verified.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long test password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a long test password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)
    await screen.findByText(`${verified.email}: unverified`)
    await waitFor(() => expect(window.location.pathname).toBe('/verify-email'))
    expect(login).toHaveBeenCalledExactlyOnceWith({ email: verified.email, password: 'a long test password', rememberMe: false })
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/household-invitations/accept?token=invite')
    expect(JSON.stringify(localStorage)).toBe(initialLocalStorage)
    expect(JSON.stringify(sessionStorage)).toBe(initialSessionStorage)
  })
})
