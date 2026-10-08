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
  const form = useRef<HTMLFormElement>(null)
  const pending = useRef(false)
  const active = useRef(true)
  // Only the last automatically attempted value is retained in this mounted
  // challenge, never in storage. Re-entering it requires an explicit button retry.
  const lastAutomaticCode = useRef<string | null>(null)
  const focusAfterFailure = useRef(false)
  useEffect(() => {
    active.current = true; heading.current?.focus()
    return () => { active.current = false; lastAutomaticCode.current = null }
  }, [])
  useEffect(() => {
    if (!busy && focusAfterFailure.current) {
      focusAfterFailure.current = false
      form.current?.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"], input[autocomplete="off"]')?.focus()
    }
  }, [busy])
  const run = async (work: () => Promise<void>, restoreCodeFocus = false) => {
    if (pending.current || !active.current) return
    pending.current = true; setBusy(true); setErrors([])
    try { await work() } catch (error) {
      if (active.current) { setErrors(getErrorMessages(error)); focusAfterFailure.current = restoreCodeFocus }
    }
    finally { pending.current = false; if (active.current) { setBusy(false); setProof(current => ({ ...current, code: '' })) } }
  }
  const verify = (value: VerificationProof) => {
    void run(async () => {
      const user = await completeLogin(value)
      if (!active.current) return
      lastAutomaticCode.current = null
      updateUser(user)
      navigate(getSafeReturnPath() ?? '/dashboard', { replace: true })
    }, true)
  }
  const changeProof = (value: VerificationProof) => {
    if (pending.current || !active.current) return
    setProof(value)
    if (value.useRecoveryCode || !/^[0-9]{6}$/.test(value.code) ||
      !(Date.now() < Date.parse(challenge.expiresAtUtc)) ||
      !(Date.now() < Date.parse(challenge.challengeExpiresAtUtc)) ||
      value.code === lastAutomaticCode.current) return
    // Trigger from an input event, not a render/timer effect, and pass the new
    // value directly so typing, paste and autofill use the same guarded request.
    lastAutomaticCode.current = value.code
    verify(value)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    verify(proof)
  }
  return <div>
    <h2 ref={heading} tabIndex={-1}>Multi-factor authentication</h2>
    <p>Your password was accepted. Verify this step before accessing your account.</p>
    <ErrorSummary errors={errors} />
    <form ref={form} onSubmit={submit} aria-label="Multi-factor authentication" aria-busy={busy}>
      <VerificationCodeFields challenge={challenge} proof={proof} onChange={changeProof} disabled={busy}
        onResend={() => void run(async () => {
          const value = await resendLoginCode(challenge.challengeId)
          if (active.current) {
            lastAutomaticCode.current = null
            setChallenge(value)
            setProof(current => ({ ...current, challengeId: value.challengeId, code: '' }))
          }
        })} />
      {!proof.useRecoveryCode && <p className="field-help">Enter or paste your six-digit code to verify automatically.
        {' '}Use Verify and sign in if you need to retry.</p>}
      <button type="submit" className="primary-button" disabled={busy || !proof.code.trim()}>{busy ? 'Verifying…' : 'Verify and sign in'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => void run(async () => { await cancelPendingLogin(); if (active.current) onCancel() })}>Back to password sign-in</button>
    </form>
    <p className="field-help">This session lasts ten minutes. If it expires, return to password sign-in. If you lose your email and all recovery codes, there is no self-service bypass.</p>
  </div>
}
