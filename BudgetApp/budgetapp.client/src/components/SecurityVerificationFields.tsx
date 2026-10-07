import { useEffect, useRef, useState } from 'react'
import { requestSecurityCode, resendSecurityCode, type SecurityPurpose, type VerificationChallenge, type VerificationProof } from '../auth/loginVerificationApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { ErrorSummary } from './ErrorSummary'
import { VerificationCodeFields } from './VerificationCodeFields'

export function SecurityVerificationFields({ purpose, password, proof, onChange, disabled }: {
  purpose: SecurityPurpose; password: string; proof: VerificationProof | undefined
  onChange: (value: VerificationProof | undefined) => void; disabled: boolean
}) {
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [needsNewChallenge, setNeedsNewChallenge] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useUnsavedChangesGuard(busy, 'A verification request is in progress. Leave this page? It may still finish, but no security setting is changed by requesting a code.')
  const request = async (resend: boolean) => {
    const reuse = resend && challenge && !needsNewChallenge && Date.now() < Date.parse(challenge.challengeExpiresAtUtc)
    if (pending.current || disabled || !password) return
    pending.current = true; setBusy(true); setErrors([])
    if (proof) onChange({ ...proof, code: '' })
    try {
      const result = reuse ? await resendSecurityCode(purpose, challenge.challengeId) : await requestSecurityCode(purpose, password)
      if (active.current) { setChallenge(result); setNeedsNewChallenge(false); onChange({ challengeId: result.challengeId, code: '', useRecoveryCode: false }) }
    } catch (error) { if (active.current) { setErrors(getErrorMessages(error)); if (reuse) setNeedsNewChallenge(true) } }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  return <div className="security-verification-fields">
    <ErrorSummary errors={errors} />
    {busy && <p role="status">Sending code…</p>}
    {challenge && proof ? <>
      <VerificationCodeFields challenge={challenge} proof={proof} onChange={onChange} disabled={disabled || busy}
        allowRecovery={purpose !== 'Enable'} canRestartExpired resendDisabled={!password} onResend={() => void request(true)} />
      {!password && <p className="field-help">Enter your current password to resend the code.</p>}
      {needsNewChallenge && <p className="field-help">Select Resend code to request a new code using your current password. No security settings will be changed.</p>}
    </> : <>
      <p className="field-help">Enter your current password, then request fresh verification for this action. Requesting a code does not save changes.</p>
      <button type="button" className="secondary-button" disabled={disabled || busy || !password} onClick={() => void request(false)}>Request verification code</button>
    </>}
  </div>
}
