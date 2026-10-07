import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { authFixture } from '../test/fixtures'
import { completeLogin, getPendingLogin, cancelPendingLogin, resendLoginCode, requestSecurityCode, manageVerification,
  type VerificationChallenge, type VerificationStatus } from '../auth/loginVerificationApi'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { LoginVerificationSettings } from '../components/LoginVerificationSettings'
import { LoginPage } from './LoginPage'

vi.mock('../auth/loginVerificationApi', async original => ({ ...await original<typeof import('../auth/loginVerificationApi')>(),
  completeLogin: vi.fn(), getPendingLogin: vi.fn(), cancelPendingLogin: vi.fn(), resendLoginCode: vi.fn(),
  requestSecurityCode: vi.fn(), resendSecurityCode: vi.fn(), manageVerification: vi.fn(),
}))
function challenge(changes: Partial<VerificationChallenge> = {}): VerificationChallenge {
  return { challengeId: 'challenge-a', expiresAtUtc: new Date(Date.now() + 300000).toISOString(),
    resendAtUtc: new Date(Date.now() - 1000).toISOString(), challengeExpiresAtUtc: new Date(Date.now() + 600000).toISOString(), delivered: true, ...changes }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getPendingLogin).mockResolvedValue({ challenge: null })
  vi.mocked(completeLogin).mockResolvedValue({ ...authFixture().user!, loginVerificationEnabled: true })
  vi.mocked(cancelPendingLogin).mockResolvedValue(undefined)
  vi.mocked(resendLoginCode).mockResolvedValue(challenge())
  vi.mocked(requestSecurityCode).mockResolvedValue(challenge())
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  window.history.replaceState(null, '', '/login?returnTo=%2Ftransactions%3Fscope%3DPersonal')
})
function LoginRoutes() {
  const { path } = useRouter()
  return path === '/login' ? <LoginPage /> : <p>Signed-in destination</p>
}
function showLogin() {
  const auth = authFixture(); auth.user = null
  const result = render(<RouterProvider><AuthContext.Provider value={auth}><LoginRoutes /></AuthContext.Provider></RouterProvider>)
  return { auth, ...result }
}
async function passwordStep(auth: ReturnType<typeof authFixture>, pending = challenge()) {
  vi.mocked(auth.login).mockResolvedValue({ requiresVerification: true, challenge: pending })
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'sample@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret password for this test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Multi-factor authentication' })
}
describe('email login verification', () => {
  it('preserves normal password-only sign-in for an unenrolled account and its destination', async () => {
    const { auth } = showLogin()
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'sample@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Signed-in destination')
    expect(auth.login).toHaveBeenCalledOnce()
    expect(window.location.search).toBe('?scope=Personal')
    expect(completeLogin).not.toHaveBeenCalled()
  })
  it('does not treat a password-only challenge as signed in; clears password UI and completes without another password', async () => {
    const initialStorage = JSON.stringify(localStorage) + JSON.stringify(sessionStorage)
    const { auth } = showLogin(); await passwordStep(auth)
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Multi-factor authentication' }))
    fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '001234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    await screen.findByText('Signed-in destination')
    expect(completeLogin).toHaveBeenCalledExactlyOnceWith({ challengeId: 'challenge-a', code: '001234', useRecoveryCode: false })
    expect(auth.updateUser).toHaveBeenCalledOnce()
    expect(auth.login).toHaveBeenCalledOnce()
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).toBe(initialStorage)
  })
  it('resumes the protected pending session after a reload without sending another email or asking for the password', async () => {
    vi.mocked(getPendingLogin).mockResolvedValue({ challenge: challenge() })
    const { auth } = showLogin()
    await screen.findByLabelText('Email verification code')
    expect(auth.login).not.toHaveBeenCalled()
    expect(resendLoginCode).not.toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })
  it('retains the challenge after failure, clears entered codes, and accepts a recovery code without disabling protection', async () => {
    vi.mocked(completeLogin).mockRejectedValueOnce(new Error('Code expired or incorrect'))
    const { auth } = showLogin(); await passwordStep(auth, challenge({ delivered: false }))
    expect(screen.getByText(/could not be delivered/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '001234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    await screen.findByText('Code expired or incorrect')
    expect((screen.getByLabelText('Email verification code') as HTMLInputElement).value).toBe('')
    expect(auth.updateUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Use a recovery code instead'))
    const input = screen.getByLabelText('Recovery code')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'offline-recovery-code' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    await screen.findByText('Signed-in destination')
    expect(completeLogin).toHaveBeenLastCalledWith({ challengeId: 'challenge-a', code: 'offline-recovery-code', useRecoveryCode: true })
    expect(auth.updateUser).toHaveBeenLastCalledWith(expect.objectContaining({ loginVerificationEnabled: true }))
  })
  it('resends only on explicit request and returns to password sign-in by canceling the pending session', async () => {
    const { auth } = showLogin(); await passwordStep(auth)
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await waitFor(() => expect(resendLoginCode).toHaveBeenCalledExactlyOnceWith('challenge-a'))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Verify and sign in' }) as HTMLButtonElement).textContent).toBe('Verify and sign in'))
    fireEvent.click(screen.getByRole('button', { name: 'Back to password sign-in' }))
    await screen.findByLabelText('Password')
    expect(cancelPendingLogin).toHaveBeenCalledOnce()
    expect(completeLogin).not.toHaveBeenCalled()
  })
  it('stops a failed pending-session read and retries only that read', async () => {
    vi.mocked(getPendingLogin).mockRejectedValueOnce(new Error('Session check failed'))
    const { auth } = showLogin()
    await screen.findByText('Session check failed')
    expect(screen.queryByText('Checking for a pending sign-in…')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry checking sign-in' }))
    await screen.findByLabelText('Password')
    expect(getPendingLogin).toHaveBeenCalledTimes(2)
    expect(auth.login).not.toHaveBeenCalled()
    expect(resendLoginCode).not.toHaveBeenCalled()
  })
  it('does not double-submit verification', async () => {
    let resolve!: (value: NonNullable<ReturnType<typeof authFixture>['user']>) => void
    vi.mocked(completeLogin).mockReturnValue(new Promise(done => { resolve = done }))
    const { auth } = showLogin(); await passwordStep(auth)
    fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '001234' } })
    const form = screen.getByRole('form', { name: 'Multi-factor authentication' })
    fireEvent.submit(form); fireEvent.submit(form)
    expect(completeLogin).toHaveBeenCalledOnce()
    await act(async () => resolve({ ...authFixture().user!, loginVerificationEnabled: true }))
    await screen.findByText('Signed-in destination')
  })
})

function SettingsHarness({ enabled = false, confirmed = true }: { enabled?: boolean; confirmed?: boolean }) {
  const [status, setStatus] = useState<VerificationStatus>({ emailEnabled: enabled, recoveryCodesRemaining: enabled ? 10 : 0 })
  const { path } = useRouter()
  if (path === '/destination') return <p>Left settings</p>
  return <><LoginVerificationSettings status={status} confirmed={confirmed} disabled={false} onBusy={() => {}}
    onSaved={async value => { setStatus(value.verification) }} /><AppLink to="/destination">Leave security settings</AppLink></>
}
function showSettings(enabled = false, confirmed = true) {
  window.history.replaceState(null, '', '/settings/account')
  return render(<RouterProvider><SettingsHarness enabled={enabled} confirmed={confirmed} /></RouterProvider>)
}
async function prepareSecurity(action: string) {
  fireEvent.click(screen.getByRole('button', { name: action }))
  fireEvent.change(screen.getByLabelText('Current password for MFA'), { target: { value: 'current secret password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request verification code' }))
  fireEvent.change(await screen.findByLabelText('Email verification code'), { target: { value: '001234' } })
}
describe('optional verification settings', () => {
  it('requires confirmed email and never starts enrollment automatically', () => {
    showSettings(false, false)
    expect(screen.getByText(/Confirm your current email address/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set up MFA' })).toBeNull()
    expect(requestSecurityCode).not.toHaveBeenCalled()
  })
  it('enrolls with fresh verification, protects once-only recovery codes, and never stores secrets in browser storage', async () => {
    const initialStorage = JSON.stringify(localStorage) + JSON.stringify(sessionStorage)
    const codes = Array.from({ length: 10 }, (_, i) => `EXAMPLE-RECOVERY-CODE-${i}`)
    vi.mocked(manageVerification).mockResolvedValue({ user: { ...authFixture().user!, loginVerificationEnabled: true }, recoveryCodes: codes,
      verification: { emailEnabled: true, recoveryCodesRemaining: 10 } })
    showSettings(); await prepareSecurity('Set up MFA')
    expect(requestSecurityCode).toHaveBeenCalledExactlyOnceWith('Enable', 'current secret password')
    expect(screen.queryByLabelText('Use a recovery code instead')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }))
    const region = await screen.findByRole('region', { name: 'Save your recovery codes' })
    expect(within(region).getAllByRole('listitem')).toHaveLength(10)
    fireEvent.click(screen.getByRole('link', { name: 'Leave security settings' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/settings/account')
    fireEvent.click(screen.getByRole('button', { name: 'I have saved my recovery codes' }))
    expect(screen.queryByText(codes[0])).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Leave security settings' }))
    await screen.findByText('Left settings')
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).toBe(initialStorage)
  })
  it('warns before disabling the last method and canceled confirmation does not write', async () => {
    showSettings(true); await prepareSecurity('Turn off MFA')
    expect(screen.getByText(/Email is your only MFA method/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off MFA' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(manageVerification).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    vi.mocked(manageVerification).mockResolvedValue({ user: { ...authFixture().user!, loginVerificationEnabled: false }, recoveryCodes: null,
      verification: { emailEnabled: false, recoveryCodesRemaining: 0 } })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off MFA' }))
    await screen.findByText('MFA is off. Future sign-ins use your password only.')
    expect(screen.getByRole('button', { name: 'Set up MFA' })).toBeTruthy()
  })
  it('failed writes do not claim success or leave passwords populated, and may be explicitly retried', async () => {
    vi.mocked(manageVerification).mockRejectedValue(new Error('Security save failed'))
    showSettings(); await prepareSecurity('Set up MFA')
    fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }))
    await screen.findByText('Security save failed')
    expect((screen.getByLabelText('Current password for MFA') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('MFA is on.')).toBeNull()
    expect(manageVerification).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Request verification code' })).toBeTruthy()
  })
})
