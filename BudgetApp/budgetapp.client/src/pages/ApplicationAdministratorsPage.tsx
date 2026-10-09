import { PageFrame } from '../components/PageFrame'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { completeAdministrativeAction, getAdministrativeAccount, getAdministrativeResult, getApplicationAdministrators,
  prepareAdministrativeAction, resendAdministrativeCode, searchAdministrativeAccounts,
  type AdministrativeAccount, type AdministrativeRequest, type AdministratorList, type AdministratorRole } from '../administration/administrationApi'
import { ApiError } from '../api/apiClient'
import { getErrorMessages } from '../auth/errorMessages'
import type { VerificationChallenge, VerificationProof } from '../auth/loginVerificationApi'
import { useAuth } from '../auth/useAuth'
import { ApplicationAdministrationNav } from '../components/ApplicationAdministrationNav'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { VerificationCodeFields } from '../components/VerificationCodeFields'
import { AppLink } from '../routing/AppLink'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { usePageLoad } from './usePageLoad'

const administratorRoleLabels: Record<AdministratorRole, string> = {
  InstallationOwner: 'Installation owner', SupportAdministrator: 'Support administrator',
}
export function ApplicationAdministratorsPage() {
  const { user } = useAuth()
  if (!user?.isApplicationOwner || !user.loginVerificationEnabled) return <PageFrame>
    <h1>Application administrators</h1><p role="alert">Only installation owners signed in with MFA can manage application-administrator access. Household ownership and support-administrator access do not grant this permission.</p>
    <AppLink to="/settings/account">Account settings</AppLink></PageFrame>
  return <AdministratorManagement />
}
function AdministratorManagement() {
  const id = useId()
  const { user, updateUser } = useAuth()
  const [administrators, setAdministrators] = useState<AdministratorList | null>(null)
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState(false)
  const [matches, setMatches] = useState<AdministrativeAccount[]>([])
  const [selected, setSelected] = useState<AdministrativeAccount | null>(null)
  const [requestedAccountId, setRequestedAccountId] = useState(() => new URLSearchParams(window.location.search).get('account'))
  const [role, setRole] = useState<AdministratorRole | 'None'>('SupportAdministrator')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [operation, setOperation] = useState<AdministrativeRequest | null>(null)
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null)
  const [proof, setProof] = useState<VerificationProof>()
  const [unknownOperation, setUnknownOperation] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const confirmDiscard = useUnsavedChangesGuard(Boolean(reason || password || operation || busy || unknownOperation),
    'You have an unfinished administrator-access change. Leave or switch context? A submitted request may still finish; check the administrative audit before repeating it.')
  const listLoad = usePageLoad('application-administrators')
  const searchLoad = usePageLoad('administrator-search')
  const accountLoad = usePageLoad('administrator-account')
  const accountRun = accountLoad.run
  useEffect(() => {
    if (requestedAccountId) void accountRun(() => getAdministrativeAccount(requestedAccountId), fresh => { setSelected(fresh); setRole(fresh.administratorRole ?? 'SupportAdministrator') })
  }, [requestedAccountId, accountRun])
  const listRun = listLoad.run
  const loadList = useCallback(async (page = 1) => { await listRun(() => getApplicationAdministrators(page), setAdministrators) }, [listRun])
  useEffect(() => { void loadList() }, [loadList])
  const reset = () => { setPassword(''); setReason(''); setOperation(null); setChallenge(null); setProof(undefined) }
  const choose = async (account: AdministrativeAccount) => {
    if (pending.current || !confirmDiscard()) return
    reset(); setRequestedAccountId(null); setErrors([]); setNotice(''); setSelected(account); accountLoad.invalidate()
    await accountLoad.run(() => getAdministrativeAccount(account.id), fresh => { setSelected(fresh); setRole(fresh.administratorRole ?? 'SupportAdministrator') })
  }
  const find = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || !confirmDiscard()) return
    reset(); setRequestedAccountId(null); setSelected(null); accountLoad.invalidate(); setErrors([]); setSearched(true)
    await searchLoad.run(() => searchAdministrativeAccounts(search.trim()), result => setMatches(result.items))
  }
  const changed = Boolean(selected && role !== (selected.administratorRole ?? 'None'))
  const eligible = role === 'None' || Boolean(selected?.emailConfirmed && selected.mfaEnabled && !selected.lockedUntilUtc)
  const canAct = accountLoad.isFresh && listLoad.isFresh && changed && eligible && !busy && !unknownOperation
  const request = async (resend = false) => {
    if (pending.current || !canAct || !selected || !password || reason.trim().length < 5) return
    const next: AdministrativeRequest = resend && operation ? operation : { operationId: crypto.randomUUID(), targetUserId: selected.id,
      action: role === 'None' ? 'RemoveAdministratorAccess' : role === 'InstallationOwner' ? 'GrantOwnerAccess' : 'GrantSupportAccess',
      reason: reason.trim(), version: selected.version, grantVersion: selected.administratorVersion ?? null, currentPassword: password }
    pending.current = true; setBusy(true); setErrors([]); setNotice('')
    try {
      const result = resend && challenge ? await resendAdministrativeCode(next, challenge.challengeId) : await prepareAdministrativeAction(next)
      if (active.current) { setOperation(next); setChallenge(result); setProof({ challengeId: result.challengeId, code: '', useRecoveryCode: false }) }
    } catch (error) { if (active.current) { setErrors(getErrorMessages(error)); setPassword(''); setOperation(null); setChallenge(null); setProof(undefined) } }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const execute = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || !canAct || !selected || !operation || !proof?.code) return
    if (!window.confirm(`${role === 'None' ? 'Remove application-administrator access' : `Grant ${administratorRoleLabels[role]} access`} for ${selected.email}? They must sign in again. This change is privately audited and they will be notified. Household permissions and financial data are unchanged.`)) return
    pending.current = true; setBusy(true); setErrors([]); setUnknownOperation(operation.operationId)
    try {
      const result = await completeAdministrativeAction(operation, proof)
      if (!active.current) return
      setNotice(result.message); setUnknownOperation(null); reset()
      if (selected.id === user?.id && ['Succeeded', 'SucceededNoticeFailed'].includes(result.outcome)) { updateUser(null); return }
      await accountLoad.run(() => getAdministrativeAccount(selected.id), fresh => { setSelected(fresh); setRole(fresh.administratorRole ?? 'None') })
      await loadList(administrators?.page ?? 1)
    } catch (error) {
      if (active.current) {
        setErrors(getErrorMessages(error)); setPassword(''); setOperation(null); setChallenge(null); setProof(undefined)
        const rejected = error instanceof ApiError && [400, 401, 403, 404, 409, 429].includes(error.status)
        if (rejected) setUnknownOperation(null)
        setNotice(rejected ? 'The request was rejected. No access change was performed. Review the error, refresh the account if needed, and explicitly request a new MFA code.' :
          'The access-change result is unknown. Check its recorded result before starting another change. Nothing will retry automatically.')
      }
    } finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const checkResult = async () => {
    if (pending.current || !unknownOperation) return
    pending.current = true; setBusy(true); setErrors([])
    try {
      const result = await getAdministrativeResult(unknownOperation)
      if (active.current) { setNotice(result.message); setUnknownOperation(null); reset(); await loadList(administrators?.page ?? 1) }
    } catch (error) { if (active.current) setErrors(getErrorMessages(error)) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  return <PageFrame>
    <header><p className="eyebrow">Installation owner controls · not household roles</p><h1>Application administrators</h1>
      <p>Manage who can operate this installation. No restart or configuration-file editing is needed for these access changes.</p></header>
    <ApplicationAdministrationNav />
    <ErrorSummary errors={errors} />
    {notice && <p role="status" className="notice-card">{notice}</p>}
    {busy && <p role="status">Processing the access request…</p>}
    {unknownOperation && <section className="notice-card" aria-label="Unconfirmed access change"><p>Operation: <code>{unknownOperation}</code>. A submitted request may still finish.</p>
      <button type="button" disabled={busy} onClick={() => void checkResult()}>Check recorded result</button></section>}
    <section className="account-settings-card"><h2>Current administrators</h2>
      <PageLoadFeedback subject="application administrators" status={listLoad.status} errors={listLoad.errors} onReload={() => void loadList(administrators?.page ?? 1)} disabled={busy} />
      {listLoad.isFresh && administrators?.items.length === 0 && <p>No application-administrator grants were returned. This is not a bootstrap or recovery screen.</p>}
      {listLoad.hasData && administrators && <><ul className="admin-account-list">{administrators.items.map(account => <li key={account.id}>
        <strong>{account.displayName}</strong><span>{account.email} · {account.administratorRole ? administratorRoleLabels[account.administratorRole] : 'No administrator access'}</span>
        <button type="button" className="text-button" disabled={busy || !listLoad.isFresh} onClick={() => void choose(account)}>Manage access for {account.email}</button></li>)}</ul>
        <div className="household-settings-actions"><button type="button" disabled={busy || !listLoad.isFresh || administrators.page <= 1} onClick={() => void loadList(administrators.page - 1)}>Previous administrators page</button>
          <span>Page {administrators.page} · {administrators.totalCount} administrators</span>
          <button type="button" disabled={busy || !listLoad.isFresh || administrators.page * administrators.pageSize >= administrators.totalCount} onClick={() => void loadList(administrators.page + 1)}>Next administrators page</button></div></>}
    </section>
    <div className="admin-support-layout"><section className="account-settings-card"><h2>Find an existing account</h2>
      <form aria-label="Find an administrator account" onSubmit={event => void find(event)}>
        <label htmlFor={`${id}-search`}>Email or display name</label><input id={`${id}-search`} required minLength={3} maxLength={256} value={search} disabled={busy} onChange={event => setSearch(event.target.value)} />
        <button type="submit" disabled={busy || (searched && searchLoad.isPending)}>Search accounts</button></form>
      <p className="field-help">At least three characters. Shows up to 25 matches. New administrators need verified email and enabled MFA.</p>
      {searched && <PageLoadFeedback subject="administrator account search" status={searchLoad.status} errors={searchLoad.errors} onReload={() => void searchLoad.run(() => searchAdministrativeAccounts(search.trim()), result => setMatches(result.items))} disabled={busy} />}
      {searched && searchLoad.isFresh && matches.length === 0 && <p>No matching accounts.</p>}
      {searchLoad.hasData && <ul className="admin-account-list">{matches.map(account => <li key={account.id}><strong>{account.displayName}</strong><span>{account.email}</span>
        <button type="button" className="text-button" disabled={busy || !searchLoad.isFresh} onClick={() => void choose(account)}>Select account {account.email}</button></li>)}</ul>}
    </section><section className="account-settings-card"><h2>Change application access</h2>
      {!selected && !requestedAccountId && <p>Select an account from the current administrators or search results.</p>}
      {(selected || requestedAccountId) && <><PageLoadFeedback subject="administrator account" status={accountLoad.status} errors={accountLoad.errors}
        onReload={() => selected ? void choose(selected) : void accountRun(() => getAdministrativeAccount(requestedAccountId!), fresh => { setSelected(fresh); setRole(fresh.administratorRole ?? 'SupportAdministrator') })} disabled={busy} />
        {selected && accountLoad.hasData && <><h3>{selected.displayName}</h3><p>{selected.email}</p>
          <p>Current access: <strong>{selected.administratorRole ? administratorRoleLabels[selected.administratorRole] : 'No administrator access'}</strong></p>
          <p className="field-help">Email: {selected.emailConfirmed ? 'Verified' : 'Not verified'} · MFA: {selected.mfaEnabled ? 'On' : 'Off'} · Sign-in: {selected.lockedUntilUtc ? 'Temporarily locked' : 'Available'}</p>
          <form aria-label="Administrator access change" onSubmit={event => void execute(event)}>
            <label htmlFor={`${id}-role`}>New application access</label><select id={`${id}-role`} value={role} disabled={busy || Boolean(challenge) || !accountLoad.isFresh || !listLoad.isFresh || Boolean(unknownOperation)} onChange={event => setRole(event.target.value as typeof role)}>
              <option value="SupportAdministrator">Support administrator</option><option value="InstallationOwner">Installation owner</option><option value="None" disabled={!selected.administratorRole}>No administrator access</option></select>
            <p className="field-help">Support administrators use account-support tools. Installation owners can also appoint or remove administrators. Neither role grants access to other households' financial records. At least one usable installation owner must remain.</p>
            {!eligible && <p role="status">This account must confirm its email, enable MFA and have available sign-in before receiving administrator access.</p>}
            <label htmlFor={`${id}-reason`}>Reason / access reference</label><textarea id={`${id}-reason`} required minLength={5} maxLength={500} value={reason} disabled={busy || Boolean(challenge) || !accountLoad.isFresh || Boolean(unknownOperation)} onChange={event => setReason(event.target.value)} />
            <p className="field-help">Privately audited. Do not include passwords, codes, tokens or financial details.</p>
            <label htmlFor={`${id}-password`}>Your current password</label><input id={`${id}-password`} type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy || Boolean(challenge) || !canAct} onChange={event => setPassword(event.target.value)} />
            {challenge && proof ? <VerificationCodeFields challenge={challenge} proof={proof} onChange={setProof} disabled={busy} canRestartExpired onResend={() => void request(Date.now() < Date.parse(challenge.challengeExpiresAtUtc))} /> :
              <button type="button" disabled={!canAct || !password || reason.trim().length < 5} onClick={() => void request()}>Request access-change MFA code</button>}
            <div className="household-settings-actions"><button type="submit" className="primary-button" disabled={!canAct || !proof?.code}>Confirm access change</button>
              <button type="button" className="text-button" disabled={busy} onClick={() => { if (confirmDiscard()) { reset(); setErrors([]) } }}>Clear access form</button></div>
          </form></>}
      </>}
    </section></div>
    <p><AppLink to="/admin">View private administrative audit and account-support tools</AppLink></p>
  </PageFrame>
}
