import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cancelPendingLogin, completeLogin, resendLoginCode, type VerificationChallenge, type VerificationProof } from '../auth/loginVerificationApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { getSafeReturnPath } from '../auth/returnPath'
import { useRouter } from '../routing/useRouter'
import { ErrorSummary } from './ErrorSummary'
import { VerificationCodeFields } from './VerificationCodeFields'

export function LoginVerificationStep({ initial, onCancel }: { initial: VerificationChallenge; onCancel: () => void }) {
  const { updateUser } = useAuth()
  const { navigate } = useRouter()
  const [challenge, setChallenge] = useState(initial)
  const [proof, setProof] = useState<VerificationProof>({ challengeId: initial.challengeId, code: '', useRecoveryCode: false })
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const heading = useRef<HTMLHeadingElement>(null)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; heading.current?.focus(); return () => { active.current = false } }, [])
  const run = async (work: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setErrors([])
    try { await work() } catch (error) { if (active.current) setErrors(getErrorMessages(error)) }
    finally { pending.current = false; if (active.current) { setBusy(false); setProof(current => ({ ...current, code: '' })) } }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const user = await completeLogin(proof)
      if (!active.current) return
      updateUser(user)
      navigate(getSafeReturnPath() ?? '/dashboard', { replace: true })
    })
  }
  return <div>
    <h2 ref={heading} tabIndex={-1}>Multi-factor authentication</h2>
    <p>Your password was accepted. Verify this step before accessing your account.</p>
    <ErrorSummary errors={errors} />
    <form onSubmit={submit} aria-label="Multi-factor authentication" aria-busy={busy}>
      <VerificationCodeFields challenge={challenge} proof={proof} onChange={setProof} disabled={busy}
        onResend={() => void run(async () => { const value = await resendLoginCode(challenge.challengeId); if (active.current) setChallenge(value) })} />
      <button type="submit" className="primary-button" disabled={busy || !proof.code.trim()}>{busy ? 'Verifying…' : 'Verify and sign in'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => void run(async () => { await cancelPendingLogin(); if (active.current) onCancel() })}>Back to password sign-in</button>
    </form>
    <p className="field-help">This session lasts ten minutes. If it expires, return to password sign-in. If you lose your email and all recovery codes, there is no self-service bypass.</p>
  </div>
}
