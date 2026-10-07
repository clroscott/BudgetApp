import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeOperatorMfaRecovery } from '../administration/administrationApi'
import { AuthContext } from '../auth/authContext'
import { authFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { AppLink } from '../routing/AppLink'
import { OperatorMfaRecoveryPage } from './OperatorMfaRecoveryPage'

vi.mock('../administration/administrationApi', () => ({ completeOperatorMfaRecovery: vi.fn() }))
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(false) })
function show(link = '/recover-mfa?userId=target&token=sample-test-link') {
  window.history.replaceState(null, '', link)
  const auth = authFixture()
  render(<RouterProvider><AuthContext.Provider value={auth}><OperatorMfaRecoveryPage /><AppLink to="/elsewhere">Leave recovery</AppLink></AuthContext.Provider></RouterProvider>)
  return auth
}
describe('operator-assisted email MFA recovery', () => {
  it('removes the URL token and never mutates anything just by opening a link', () => {
    show()
    expect(window.location.search).toBe('')
    expect(completeOperatorMfaRecovery).not.toHaveBeenCalled()
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain('sample-test-link')
  })
  it('does not offer a submission for an incomplete link', () => {
    show('/recover-mfa')
    expect(screen.getByRole('alert').textContent).toMatch(/link is incomplete/)
    expect(screen.queryByRole('button', { name: 'Confirm MFA recovery' })).toBeNull()
  })
  it('requires an explicit password submission, shows recovery codes once, and does not auto-login', async () => {
    const codes = Array.from({ length: 10 }, (_, index) => `EXAMPLE-RECOVERY-${index}`)
    vi.mocked(completeOperatorMfaRecovery).mockResolvedValue({ recoveryCodes: codes })
    const auth = show()
    fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'current target password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm MFA recovery' }))
    await screen.findByRole('region', { name: 'Save your recovery codes' })
    expect(completeOperatorMfaRecovery).toHaveBeenCalledExactlyOnceWith('target', 'sample-test-link', 'current target password')
    expect(auth.updateUser).toHaveBeenCalledWith(null); expect(auth.login).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Leave recovery' }))
    expect(window.confirm).toHaveBeenCalledOnce(); expect(window.location.pathname).toBe('/recover-mfa')
    fireEvent.click(screen.getByRole('button', { name: 'I have saved my recovery codes' }))
    expect(screen.queryByText(codes[0])).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in with MFA' })).toBeTruthy()
  })
  it('clears entered passwords on failure and does not silently retry', async () => {
    vi.mocked(completeOperatorMfaRecovery).mockRejectedValue(new Error('Recovery unavailable'))
    show(); fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'wrong target password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm MFA recovery' }))
    await screen.findByText('Recovery unavailable')
    expect((screen.getByLabelText('Your current password') as HTMLInputElement).value).toBe('')
    expect(completeOperatorMfaRecovery).toHaveBeenCalledOnce()
  })
})
