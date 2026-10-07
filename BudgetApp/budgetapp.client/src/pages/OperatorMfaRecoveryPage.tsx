import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { completeOperatorMfaRecovery } from '../administration/administrationApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { RecoveryCodeDisplay } from '../components/LoginVerificationSettings'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'

export function OperatorMfaRecoveryPage() {
  const id = useId()
  const { updateUser } = useAuth()
  const { navigate } = useRouter()
  const [parameters, setParameters] = useState(() => { const q = new URLSearchParams(window.location.search); return { userId: q.get('userId') ?? '', token: q.get('token') ?? '' } })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [codes, setCodes] = useState<string[] | null>(null)
  const [finished, setFinished] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  // Retain the link only in component memory; remove it from the address bar/history.
  useEffect(() => { if (window.location.search) navigate('/recover-mfa', { replace: true, bypassBlocker: true }) }, [navigate])
  useUnsavedChangesGuard(Boolean(password || busy || codes), codes ? 'Save your new recovery codes before leaving. They are shown only once.' :
    'You have an unfinished MFA recovery. Leave? A submitted request may still finish; no automatic retry is performed.')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || !password || !parameters.userId || !parameters.token) return
    pending.current = true; setBusy(true); setErrors([])
    try {
      const result = await completeOperatorMfaRecovery(parameters.userId, parameters.token, password)
      if (active.current) { setCodes(result.recoveryCodes); setParameters({ userId: '', token: '' }); updateUser(null) }
    } catch (error) { if (active.current) setErrors(getErrorMessages(error)) }
    finally { pending.current = false; if (active.current) { setBusy(false); setPassword('') } }
  }
  return <main className="auth-page"><section className="auth-card household-setup-card" aria-labelledby={`${id}-heading`}>
    <h1 id={`${id}-heading`}>Recover email MFA</h1>
    <p>Your registered email and current password are both required. Email MFA stays on; old recovery codes and sessions are replaced. Your financial data is kept.</p>
    <ErrorSummary errors={errors} />
    {codes ? <><p role="status">Email MFA was reset. Save your new codes, then sign in again.</p>
      <RecoveryCodeDisplay codes={codes} busy={busy} onAcknowledge={() => { setCodes(null); setFinished(true) }} /></> : finished ?
      <AppLink className="primary-button" to="/login">Sign in with MFA</AppLink> : !parameters.userId || !parameters.token ?
        <p role="alert">This recovery link is incomplete. Ask the application administrator to send a new link to your registered, verified email.</p> :
        <form aria-label="Confirm email MFA recovery" onSubmit={event => void submit(event)} aria-busy={busy}>
          <label htmlFor={`${id}-password`}>Your current password</label><input id={`${id}-password`} type="password" autoComplete="current-password"
            required maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
          <button type="submit" className="primary-button" disabled={busy || !password}>{busy ? 'Recovering MFA…' : 'Confirm MFA recovery'}</button>
        </form>}
    <p className="field-help">Opening the email link does not reset anything. This is not a recovery route for lost email access. Never share the link or your password.</p>
  </section></main>
}
