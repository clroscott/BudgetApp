import { useEffect, useId, useRef, useState } from 'react'
import type { VerificationChallenge, VerificationProof } from '../auth/loginVerificationApi'

export function VerificationCodeFields({ challenge, proof, onChange, disabled, allowRecovery = true, onResend }: {
  challenge: VerificationChallenge; proof: VerificationProof; onChange: (value: VerificationProof) => void
  disabled: boolean; allowRecovery?: boolean; onResend: () => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const wait = Math.max(0, Math.ceil((Date.parse(challenge.resendAtUtc) - now) / 1000))
  const expired = now >= Date.parse(challenge.expiresAtUtc)
  const sessionExpired = now >= Date.parse(challenge.challengeExpiresAtUtc)
  return <div className="verification-code-fields">
    <p className={challenge.delivered ? 'field-help' : 'notice-card'} role="status">
      {challenge.delivered ? 'A code was sent to your confirmed email. Check your inbox and spam folder.' :
        allowRecovery ? 'The verification email could not be delivered. Your security settings have not been bypassed. Try resending, or use a saved recovery code if available.' :
          'The verification email could not be delivered. Enrollment remains off. Try resending before enabling verification.'}
    </p>
    {allowRecovery && <label className="checkbox-row"><input type="checkbox" checked={proof.useRecoveryCode} disabled={disabled}
      onChange={event => { onChange({ ...proof, code: '', useRecoveryCode: event.target.checked }); input.current?.focus() }} />
      <span>Use a recovery code instead</span></label>}
    <label htmlFor={`${id}-code`}>{proof.useRecoveryCode ? 'Recovery code' : 'Email verification code'}</label>
    <input ref={input} id={`${id}-code`} type="text" autoComplete={proof.useRecoveryCode ? 'off' : 'one-time-code'}
      inputMode={proof.useRecoveryCode ? 'text' : 'numeric'} pattern={proof.useRecoveryCode ? undefined : '[0-9]{8}'}
      maxLength={proof.useRecoveryCode ? 100 : 8} required value={proof.code} disabled={disabled}
      aria-describedby={`${id}-help`} onChange={event => onChange({ ...proof, code: event.target.value })} />
    <p id={`${id}-help`} className="field-help">{sessionExpired ? 'This verification session has expired. Start new verification or return to password sign-in.' :
      proof.useRecoveryCode ? 'Each recovery code works once. Using it does not turn verification off.' :
      expired ? 'This email code has expired. Resend for a new code; the overall verification session lasts ten minutes.' :
        `Enter all eight digits, including leading zeros. The code expires at ${new Date(challenge.expiresAtUtc).toLocaleTimeString()}.`}</p>
    <button type="button" className="text-button" disabled={disabled || wait > 0 || sessionExpired} onClick={onResend}>
      {wait > 0 ? `Resend code in ${wait}s` : 'Resend verification code'}
    </button>
  </div>
}
