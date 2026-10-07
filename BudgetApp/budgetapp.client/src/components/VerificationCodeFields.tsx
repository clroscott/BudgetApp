import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { VerificationChallenge, VerificationProof } from '../auth/loginVerificationApi'
import { EmailCodeInput } from './EmailCodeInput'

export function VerificationCodeFields({ challenge, proof, onChange, disabled, allowRecovery = true, canRestartExpired = false, resendDisabled = false, onResend }: {
  challenge: VerificationChallenge; proof: VerificationProof; onChange: (value: VerificationProof) => void
  disabled: boolean; allowRecovery?: boolean; canRestartExpired?: boolean; resendDisabled?: boolean; onResend: () => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const previousRecovery = useRef(proof.useRecoveryCode)
  useLayoutEffect(() => {
    if (previousRecovery.current !== proof.useRecoveryCode) input.current?.focus()
    previousRecovery.current = proof.useRecoveryCode
  }, [proof.useRecoveryCode])
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const wait = Math.max(0, Math.ceil((Date.parse(challenge.resendAtUtc) - now) / 1000))
  const expired = now >= Date.parse(challenge.expiresAtUtc)
  const sessionExpired = now >= Date.parse(challenge.challengeExpiresAtUtc)
  return <div className="verification-code-fields">
    <p className={challenge.delivered ? 'field-help' : 'notice-card'} role="status">
      {challenge.delivered ? 'A code was sent to your confirmed email. Check your inbox and spam folder.' :
        allowRecovery ? 'The verification email could not be delivered. Your security settings have not been bypassed. Try resending, or use a saved recovery code if available.' :
          'The verification email could not be delivered. MFA remains off. Try resending before enabling MFA.'}
    </p>
    {allowRecovery && <label className="checkbox-row"><input type="checkbox" checked={proof.useRecoveryCode} disabled={disabled}
      onChange={event => onChange({ ...proof, code: '', useRecoveryCode: event.target.checked })} />
      <span>Use a recovery code instead</span></label>}
    <label htmlFor={`${id}-code`}>{proof.useRecoveryCode ? 'Recovery code' : 'Email verification code'}</label>
    {proof.useRecoveryCode ? <input ref={input} id={`${id}-code`} type="text" autoComplete="off"
      maxLength={100} required value={proof.code} disabled={disabled}
      aria-describedby={`${id}-help`} onChange={event => onChange({ ...proof, code: event.target.value })} /> :
      <EmailCodeInput id={`${id}-code`} inputRef={input} value={proof.code} disabled={disabled}
        describedBy={`${id}-help`} onChange={code => onChange({ ...proof, code })} />}
    <p id={`${id}-help`} className="field-help">{sessionExpired ? (canRestartExpired ?
      'This code session has expired. Select Resend code to receive a new code for this action.' :
      'This code session has expired. Return to password sign-in to receive a new code.') :
      proof.useRecoveryCode ? 'Each recovery code works once. Using it does not turn verification off.' :
      expired ? 'This email code has expired. Resend for a new code; the overall verification session lasts ten minutes.' :
        `Enter or paste all six digits, including leading zeros. The code expires at ${new Date(challenge.expiresAtUtc).toLocaleTimeString()}.`}</p>
    <button type="button" className="text-button" disabled={disabled || resendDisabled || wait > 0 || (sessionExpired && !canRestartExpired)} onClick={onResend}>
      {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
    </button>
  </div>
}
