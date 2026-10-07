import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestSecurityCode, resendSecurityCode, type VerificationChallenge, type VerificationProof } from '../auth/loginVerificationApi'
import { RouterProvider } from '../routing/RouterProvider'
import { SecurityVerificationFields } from './SecurityVerificationFields'
import { VerificationCodeFields } from './VerificationCodeFields'

vi.mock('../auth/loginVerificationApi', () => ({ requestSecurityCode: vi.fn(), resendSecurityCode: vi.fn() }))
const challenge = (changes: Partial<VerificationChallenge> = {}): VerificationChallenge => ({
  challengeId: 'a', delivered: true, expiresAtUtc: new Date(Date.now() + 300000).toISOString(),
  resendAtUtc: new Date(Date.now() - 1000).toISOString(), challengeExpiresAtUtc: new Date(Date.now() + 600000).toISOString(), ...changes,
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requestSecurityCode).mockResolvedValue(challenge())
  vi.mocked(resendSecurityCode).mockResolvedValue(challenge())
})
function Harness() {
  const [proof, setProof] = useState<VerificationProof>()
  return <SecurityVerificationFields purpose="Enable" password="test current password" proof={proof} onChange={setProof} disabled={false} />
}
async function show() {
  render(<RouterProvider><Harness /></RouterProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Request verification code' }))
  await screen.findByLabelText('Email verification code')
}
describe('explicit code resending', () => {
  it('offers one resend action and preserves the existing challenge during normal resend', async () => {
    await show()
    expect(screen.queryByText('Start new verification')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Resend code' })).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '001234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await waitFor(() => expect(resendSecurityCode).toHaveBeenCalledExactlyOnceWith('Enable', 'a'))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Resend code' }) as HTMLButtonElement).disabled).toBe(false))
    expect((screen.getByLabelText('Email verification code') as HTMLInputElement).value).toBe('')
    expect(requestSecurityCode).toHaveBeenCalledTimes(1)
  })
  it('starts a fresh expired settings challenge only when Resend code is selected', async () => {
    vi.mocked(requestSecurityCode).mockResolvedValueOnce(challenge({
      expiresAtUtc: new Date(Date.now() - 1000).toISOString(), challengeExpiresAtUtc: new Date(Date.now() - 1000).toISOString(),
    }))
    await show()
    expect(screen.getByText(/This code session has expired/)).toBeTruthy()
    expect(requestSecurityCode).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await waitFor(() => expect(requestSecurityCode).toHaveBeenCalledTimes(2))
    expect(requestSecurityCode).toHaveBeenLastCalledWith('Enable', 'test current password')
    expect(resendSecurityCode).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText(/This code session has expired/)).toBeNull())
  })
  it('recovers an unavailable challenge on a second explicit request without automatic duplicate sending', async () => {
    vi.mocked(resendSecurityCode).mockRejectedValue(new Error('Challenge is no longer available'))
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await screen.findByText('Challenge is no longer available')
    expect(requestSecurityCode).toHaveBeenCalledTimes(1)
    expect(resendSecurityCode).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await waitFor(() => expect(requestSecurityCode).toHaveBeenCalledTimes(2))
    expect(resendSecurityCode).toHaveBeenCalledTimes(1)
  })
  it('honors resend cooldown and does not restart an expired password-only login session', () => {
    const onResend = vi.fn()
    const proof = { challengeId: 'a', code: '', useRecoveryCode: false }
    const { rerender } = render(<VerificationCodeFields challenge={challenge({ resendAtUtc: new Date(Date.now() + 60000).toISOString() })}
      proof={proof} onChange={() => {}} disabled={false} onResend={onResend} />)
    expect((screen.getByRole('button', { name: /Resend code in/ }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<VerificationCodeFields challenge={challenge({ expiresAtUtc: new Date(Date.now() - 1000).toISOString(),
      challengeExpiresAtUtc: new Date(Date.now() - 1000).toISOString() })} proof={proof} onChange={() => {}} disabled={false} onResend={onResend} />)
    expect((screen.getByRole('button', { name: 'Resend code' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Return to password sign-in to receive a new code/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    expect(onResend).not.toHaveBeenCalled()
  })
})
