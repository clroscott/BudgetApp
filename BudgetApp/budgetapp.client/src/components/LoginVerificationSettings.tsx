import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { manageVerification, type VerificationProof, type VerificationResult, type VerificationStatus } from '../auth/loginVerificationApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { ErrorSummary } from './ErrorSummary'
import { SecurityVerificationFields } from './SecurityVerificationFields'

type Action = 'Enable' | 'Disable' | 'RecoveryCodes'
export function RecoveryCodeDisplay({ codes, busy, onAcknowledge }: { codes: string[]; busy: boolean; onAcknowledge: () => void }) {
  return <div className="notice-card recovery-code-card" role="region" aria-label="Save your recovery codes">
    <h3>Save your recovery codes now</h3>
    <p>These ten codes are shown only once. Copy them to a safe place outside MC Budget. Each works once. Replacing codes invalidates all older ones.</p>
    <ol>{codes.map(code => <li key={code}><code>{code}</code></li>)}</ol>
    <p>If you lose access to your email and all recovery codes, there is no self-service way to bypass verification.</p>
    <button type="button" className="primary-button" disabled={busy} onClick={onAcknowledge}>I have saved my recovery codes</button>
  </div>
}
export function LoginVerificationSettings({ status, confirmed, disabled, onSaved, onBusy }: {
  status: VerificationStatus; confirmed: boolean; disabled: boolean
  onSaved: (value: VerificationResult) => Promise<void>; onBusy: (value: boolean) => void
}) {
  const id = useId()
  const [action, setAction] = useState<Action | null>(null)
  const [password, setPassword] = useState('')
  const [proof, setProof] = useState<VerificationProof>()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [reset, setReset] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const active = useRef(true)
  const pending = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useUnsavedChangesGuard(Boolean(password || proof || codes || busy), codes ?
    'Save your recovery codes before leaving. They are shown only once and will not be available again.' :
    'You have an unfinished account security action. Leave this page? An in-progress request may still finish.')
  const choose = (next: Action) => {
    setAction(next); setPassword(''); setProof(undefined); setErrors([]); setNotice(''); setReset(value => value + 1)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || disabled || !action || !proof?.code.trim()) return
    if (action === 'Disable' && !window.confirm('Turn off your last verification method? Future sign-ins will use your password only. Your financial data is kept.')) return
    pending.current = true; setBusy(true); onBusy(true); setErrors([])
    void manageVerification(action, password, proof).then(async result => {
      if (!active.current) return
      setCodes(result.recoveryCodes)
      setAction(null); setProof(undefined)
      setNotice(result.verification.emailEnabled ? 'Additional login verification is on.' : 'Additional login verification is off. Future sign-ins use your password only.')
      await onSaved(result)
      if (active.current) heading.current?.focus()
    }).catch(error => { if (active.current) setErrors(getErrorMessages(error)) })
      .finally(() => {
        pending.current = false
        if (active.current) { setBusy(false); setPassword(''); setProof(undefined); setReset(value => value + 1); onBusy(false) }
      })
  }
  return <section className="account-settings-card" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <h2 ref={heading} id={`${id}-heading`} tabIndex={-1}>Additional login verification</h2>
    <p>{status.emailEnabled ? 'On — email code or a saved recovery code is required after your password.' : 'Off — your password is the only login step.'}</p>
    <p className="field-help">Optional extra protection for your personal account. It is separate from confirming email ownership and applies across all households.</p>
    <ErrorSummary errors={errors} />
    {notice && <p className="success-summary" role="status">{notice}</p>}
    {busy && <p role="status">Saving security settings…</p>}
    {codes ? <RecoveryCodeDisplay codes={codes} busy={busy} onAcknowledge={() => setCodes(null)} /> : action ? <form onSubmit={submit} aria-label="Manage additional login verification">
      <h3>{action === 'Enable' ? 'Enable email verification' : action === 'Disable' ? 'Turn verification off' : 'Replace recovery codes'}</h3>
      {action === 'Disable' && <p className="notice-card">Email is your only additional method. Turning it off removes the second login step, not your password or financial data.</p>}
      <label htmlFor={`${id}-password`}>Current password for login verification</label>
      <input id={`${id}-password`} type="password" autoComplete="current-password" required maxLength={128} disabled={disabled || busy}
        value={password} onChange={event => setPassword(event.target.value)} />
      <SecurityVerificationFields key={reset} purpose={action} password={password} proof={proof} onChange={setProof} disabled={disabled || busy} />
      <div className="household-settings-actions">
        <button type="submit" className="primary-button" disabled={disabled || busy || !password || !proof?.code.trim()}>
          {action === 'Enable' ? 'Enable verification' : action === 'Disable' ? 'Turn off verification' : 'Replace recovery codes'}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          setAction(null); setPassword(''); setProof(undefined); setErrors([])
        }}>Cancel security action</button>
      </div>
    </form> : <>
      {status.emailEnabled && <p>Unused recovery codes: {status.recoveryCodesRemaining}. {status.recoveryCodesRemaining === 0 ? 'Replace your codes while you can still receive email.' : 'Keep your codes offline for email outages or lost mailbox access.'}</p>}
      {!confirmed ? <p>Confirm your current email address before enabling login verification.</p> : <div className="household-settings-actions">
        {status.emailEnabled ? <>
          <button type="button" className="secondary-button" disabled={disabled || busy} onClick={() => choose('RecoveryCodes')}>Replace recovery codes</button>
          <button type="button" className="text-button danger-text" disabled={disabled || busy} onClick={() => choose('Disable')}>Turn off verification</button>
        </> : <button type="button" className="secondary-button" disabled={disabled || busy} onClick={() => choose('Enable')}>Set up email verification</button>}
      </div>}
    </>}
  </section>
}
