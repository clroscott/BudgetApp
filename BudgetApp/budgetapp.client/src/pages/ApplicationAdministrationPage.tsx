import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { completeAdministrativeAction, getAdministrativeAccount, getAdministrativeAudit, getAdministrativeResult,
  prepareAdministrativeAction, resendAdministrativeCode, searchAdministrativeAccounts,
  type AdministrativeAccount, type AdministrativeAction, type AdministrativeAudit, type AdministrativeRequest } from '../administration/administrationApi'
import { ApiError } from '../api/apiClient'
import { getErrorMessages } from '../auth/errorMessages'
import type { VerificationChallenge, VerificationProof } from '../auth/loginVerificationApi'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { VerificationCodeFields } from '../components/VerificationCodeFields'
import { ApplicationAdministrationNav } from '../components/ApplicationAdministrationNav'
import { AppLink } from '../routing/AppLink'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { usePageLoad } from './usePageLoad'

const labels: Record<AdministrativeAction, string> = {
  PasswordResetEmail: 'Send password-reset email', MfaRecoveryEmail: 'Send MFA-recovery email', RevokeSessions: 'Revoke sessions',
  GrantOwnerAccess: 'Grant installation-owner access', GrantSupportAccess: 'Grant support-administrator access', RemoveAdministratorAccess: 'Remove administrator access',
}
export function ApplicationAdministrationPage() {
  const { user } = useAuth()
  if (!user?.isApplicationAdministrator) return <main className="management-page"><section className="management-content">
    <h1>Application administration</h1><p role="alert">You do not have application-admin access. Household administrator roles do not grant this access.</p>
    <AppLink to="/settings/account">Account settings</AppLink></section></main>
  if (!user.loginVerificationEnabled) return <main className="management-page"><section className="management-content">
    <h1>Application administration</h1><p>MFA must be enabled and completed at sign-in before you can use operator tools.</p>
    <AppLink to="/settings/account">Set up MFA in Account settings</AppLink></section></main>
  return <AdministrationContent />
}
function AdministrationContent() {
  const id = useId()
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState(false)
  const [accounts, setAccounts] = useState<AdministrativeAccount[]>([])
  const [selected, setSelected] = useState<AdministrativeAccount | null>(null)
  const [requestedAccountId, setRequestedAccountId] = useState(() => new URLSearchParams(window.location.search).get('account'))
  const [action, setAction] = useState<AdministrativeAction>('PasswordResetEmail')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [operation, setOperation] = useState<AdministrativeRequest | null>(null)
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null)
  const [proof, setProof] = useState<VerificationProof>()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [unconfirmedResult, setUnconfirmedResult] = useState<string | null>(null)
  const [audit, setAudit] = useState<AdministrativeAudit | null>(null)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const confirmDiscard = useUnsavedChangesGuard(Boolean(reason || password || operation || busy || unconfirmedResult),
    'You have an unfinished administrative action. Leave or switch context? A submitted request may still finish. Check the administrative audit before repeating it.')
  const directoryLoad = usePageLoad('admin-directory')
  const accountLoad = usePageLoad('admin-account')
  const accountRun = accountLoad.run
  useEffect(() => {
    if (requestedAccountId) void accountRun(() => getAdministrativeAccount(requestedAccountId), data => { setSelected(data); setAction('PasswordResetEmail') })
  }, [requestedAccountId, accountRun])
  const auditLoad = usePageLoad('admin-audit')
  const auditRun = auditLoad.run
  const loadAudit = useCallback(async (page = 1) => {
    await auditRun(() => getAdministrativeAudit(page), data => setAudit(data))
  }, [auditRun])
  useEffect(() => { void loadAudit() }, [loadAudit])
  const reset = () => { setReason(''); setPassword(''); setOperation(null); setChallenge(null); setProof(undefined) }
  const find = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || !confirmDiscard()) return
    reset(); setRequestedAccountId(null); setSelected(null); accountLoad.invalidate(); setErrors([]); setSearched(true)
    await directoryLoad.run(() => searchAdministrativeAccounts(search.trim()), data => setAccounts(data.items))
  }
  const choose = async (account: AdministrativeAccount) => {
    if (pending.current || !confirmDiscard()) return
    reset(); setRequestedAccountId(null); setErrors([]); setNotice(''); setSelected(account); accountLoad.invalidate()
    await accountLoad.run(() => getAdministrativeAccount(account.id), data => { setSelected(data); setAction('PasswordResetEmail') })
  }
  const canAct = Boolean(selected && !selected.isApplicationAdministrator && accountLoad.isFresh && !busy && !unconfirmedResult)
  const request = async (resend = false) => {
    if (pending.current || !canAct || !selected || !password || reason.trim().length < 5) return
    pending.current = true; setBusy(true); setErrors([]); setNotice('')
    const next = resend && operation ? operation : { operationId: crypto.randomUUID(), targetUserId: selected.id,
      action, reason: reason.trim(), version: selected.version, currentPassword: password }
    try {
      const value = resend && challenge ? await resendAdministrativeCode(next, challenge.challengeId) : await prepareAdministrativeAction(next)
      if (active.current) { setOperation(next); setChallenge(value); setProof({ challengeId: value.challengeId, code: '', useRecoveryCode: false }) }
    } catch (error) { if (active.current) { setErrors(getErrorMessages(error)); setPassword(''); setOperation(null); setChallenge(null); setProof(undefined) } }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const execute = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || !canAct || !operation || !proof?.code || !selected) return
    if (!window.confirm(`${labels[action]} for ${selected.email}? ${action === 'RevokeSessions' ? 'All their sessions will be invalidated.' : 'Recovery instructions go only to their verified email; sending them does not change credentials.'} This is recorded in the private administrative audit.`)) return
    pending.current = true; setBusy(true); setErrors([]); setUnconfirmedResult(operation.operationId)
    try {
      const result = await completeAdministrativeAction(operation, proof)
      if (!active.current) return
      setNotice(result.message); setUnconfirmedResult(null); reset()
      await accountLoad.run(() => getAdministrativeAccount(selected.id), data => setSelected(data))
      await loadAudit(audit?.page ?? 1)
    } catch (error) {
      if (active.current) {
        setErrors(getErrorMessages(error)); setPassword(''); setOperation(null); setChallenge(null); setProof(undefined)
        // These are definitive rejection responses from this endpoint, before
        // any support mutation/email. Network and server failures remain unknown.
        const rejected = error instanceof ApiError && [400, 401, 403, 404, 409, 429].includes(error.status)
        if (rejected) setUnconfirmedResult(null)
        setNotice(rejected ? 'The request was rejected; no support action was performed. Review the error and request a new MFA code to retry. Nothing will retry automatically.' :
          'The action result has not been confirmed. Check the recorded result before starting another action. No automatic retry will occur.')
      }
    } finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const checkResult = async () => {
    if (pending.current || !unconfirmedResult) return
    pending.current = true; setBusy(true); setErrors([])
    try {
      const result = await getAdministrativeResult(unconfirmedResult)
      if (active.current) { setNotice(result.message); setUnconfirmedResult(null); reset(); await loadAudit(audit?.page ?? 1) }
    } catch (error) { if (active.current) setErrors(getErrorMessages(error)) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const formLocked = busy || Boolean(challenge)
  return <main className="management-page"><section className="management-content">
    <header className="page-title-row"><div><p className="eyebrow">Application operators · not household administration</p>
      <h1>Application administration</h1><p>Account support and a private administrative audit. No financial-data browsing or impersonation.</p></div>
      <AppLink className="header-link" to="/settings/account">Your account settings</AppLink></header>
    <ApplicationAdministrationNav />
    <ErrorSummary errors={errors} />
    {notice && <p className="notice-card" role="status">{notice}</p>}
    {busy && <p role="status">Processing the administrative request…</p>}
    {unconfirmedResult && <section className="notice-card" aria-label="Unconfirmed action result">
      <p>Operation: <code>{unconfirmedResult}</code>. A submitted request may still finish; don't repeat it blindly.</p>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void checkResult()}>Check recorded result</button>
    </section>}
    <div className="admin-support-layout"><section className="account-settings-card" aria-labelledby={`${id}-search-heading`}>
      <h2 id={`${id}-search-heading`}>Find an account</h2>
      <form aria-label="Find an account" onSubmit={event => void find(event)}>
        <label htmlFor={`${id}-search`}>Email or display name</label>
        <input id={`${id}-search`} required minLength={3} maxLength={256} value={search} disabled={busy}
          onChange={event => setSearch(event.target.value)} />
        <button className="secondary-button" disabled={busy || (searched && directoryLoad.isPending)}>Search accounts</button>
      </form><p className="field-help">At least three characters. Up to 25 matching accounts are shown; narrow your search if needed.</p>
      {searched && <PageLoadFeedback subject="account search" status={directoryLoad.status} errors={directoryLoad.errors}
        onReload={() => void directoryLoad.run(() => searchAdministrativeAccounts(search.trim()), data => setAccounts(data.items))} disabled={busy} />}
      {searched && directoryLoad.isFresh && accounts.length === 0 && <p>No matching accounts.</p>}
      {directoryLoad.hasData && <ul className="admin-account-list">{accounts.map(account => <li key={account.id}>
        <strong>{account.displayName}</strong><span>{account.email}</span>
        <button type="button" className="text-button" disabled={busy || !directoryLoad.isFresh} onClick={() => void choose(account)}>View account {account.email}</button>
      </li>)}</ul>}
    </section><section className="account-settings-card" aria-labelledby={`${id}-support-heading`}>
      <h2 id={`${id}-support-heading`}>Account support</h2>
      {!selected && !requestedAccountId && <p>Select an account to review its status. Household permissions and financial records are not available here.</p>}
      {(selected || requestedAccountId) && <>
        <PageLoadFeedback subject="selected account" status={accountLoad.status} errors={accountLoad.errors}
          onReload={() => selected ? void choose(selected) : void accountRun(() => getAdministrativeAccount(requestedAccountId!), setSelected)} disabled={busy} />
        {selected && accountLoad.hasData && <><h3>{selected.displayName}</h3><p>{selected.email}</p>
        <dl className="admin-account-status"><dt>Email ownership</dt><dd>{selected.emailConfirmed ? 'Verified' : 'Not verified'}</dd>
          <dt>MFA</dt><dd>{selected.mfaEnabled ? 'On (email)' : 'Off'}</dd>
          <dt>Sign-in lockout</dt><dd>{selected.lockedUntilUtc ? `Until ${new Date(selected.lockedUntilUtc).toLocaleString()}` : 'Not locked'}</dd>
          <dt>Account ID</dt><dd><code>{selected.id}</code></dd></dl>
        {selected.isApplicationAdministrator ? <p className="notice-card">Application-administrator accounts cannot be changed with these support tools.</p> : <form aria-label="Administrative action" onSubmit={event => void execute(event)}>
          <label htmlFor={`${id}-action`}>Support action</label><select id={`${id}-action`} value={action} disabled={!canAct || formLocked}
            onChange={event => setAction(event.target.value as AdministrativeAction)}>
            <option value="PasswordResetEmail">Send password-reset email</option>
            <option value="MfaRecoveryEmail" disabled={!selected.mfaEnabled || !selected.emailConfirmed}>Send MFA-recovery email</option>
            <option value="RevokeSessions">Revoke sessions</option></select>
          <p className="field-help">{action === 'MfaRecoveryEmail' ? 'The user must confirm the email link and their current password. Old codes and sessions are replaced only then; email MFA remains on. Lost-email recovery is not supported.' :
            action === 'PasswordResetEmail' ? 'The user chooses their password using the existing reset flow. This does not disable MFA or change their email.' : 'Invalidate all sign-in sessions. No budgets, transactions, or MFA settings are deleted.'}</p>
          <label htmlFor={`${id}-reason`}>Reason / support reference</label>
          <textarea id={`${id}-reason`} minLength={5} maxLength={500} required value={reason} disabled={!canAct || formLocked} onChange={event => setReason(event.target.value)} />
          <p className="field-help">Required, 5–500 characters. Do not include passwords, codes, tokens, or financial details. This is stored in the private administrative audit.</p>
          <label htmlFor={`${id}-password`}>Your current password</label>
          <input id={`${id}-password`} type="password" autoComplete="current-password" required maxLength={128} disabled={!canAct || formLocked}
            value={password} onChange={event => setPassword(event.target.value)} />
          {challenge && proof ? <VerificationCodeFields challenge={challenge} proof={proof} onChange={setProof} disabled={busy} canRestartExpired
            onResend={() => void request(Date.now() < Date.parse(challenge.challengeExpiresAtUtc))} /> :
            <button type="button" className="secondary-button" disabled={!canAct || !password || reason.trim().length < 5 || (action !== 'RevokeSessions' && !selected.emailConfirmed)} onClick={() => void request()}>Request admin MFA code</button>}
          <div className="household-settings-actions">
            <button type="submit" className="primary-button" disabled={!canAct || !proof?.code}>{labels[action]}</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => { if (confirmDiscard()) { reset(); setErrors([]) } }}>Clear action form</button>
          </div>
        </form>}</>}
      </>}
    </section></div>
    <section className="account-settings-card" aria-labelledby={`${id}-audit-heading`}>
      <h2 id={`${id}-audit-heading`}>Administrative audit</h2><p className="field-help">Private operator actions—not shared household activity. Actor and account IDs are retained even if display names change.</p>
      <PageLoadFeedback subject="administrative audit" status={auditLoad.status} errors={auditLoad.errors} onReload={() => void loadAudit(audit?.page ?? 1)} disabled={busy} />
      {auditLoad.isFresh && audit?.items.length === 0 && <p>No administrative actions recorded.</p>}
      {auditLoad.hasData && audit && <><ol className="admin-audit-list">{audit.items.map(item => <li key={item.id}>
        <strong>{labels[item.action as AdministrativeAction] ?? (item.action === 'MfaRecoveryCompleted' ? 'User completed MFA recovery' : item.action === 'BootstrapOwner' ? 'Initial installation-owner setup' : item.action)}</strong>
        <span>{item.outcome} · {new Date(item.occurredAtUtc).toLocaleString()}</span>
        <p>{item.reason}</p><p className="field-help">Actor: {item.actorUserId} · Account: {item.targetUserId} · Operation: {item.id}</p>
      </li>)}</ol><div className="household-settings-actions">
        <button type="button" disabled={busy || !auditLoad.isFresh || audit.page <= 1} onClick={() => void loadAudit(audit.page - 1)}>Previous audit page</button>
        <span>Page {audit.page} · {audit.totalCount} records</span>
        <button type="button" disabled={busy || !auditLoad.isFresh || audit.page * audit.pageSize >= audit.totalCount} onClick={() => void loadAudit(audit.page + 1)}>Next audit page</button>
      </div></>}
    </section>
  </section></main>
}
