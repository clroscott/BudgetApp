import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/apiClient'
import { changePassword, getAccountSettings, saveDisplayName, type AccountSettings } from '../auth/accountSettingsApi'
import { requestEmailChange, resendConfirmation } from '../auth/authApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { usePageLoad } from './usePageLoad'

type Action = 'profile' | 'email' | 'password' | 'resend' | 'logout'
const emptyEmail = { newEmail: '', currentPassword: '' }
const emptyPassword = { currentPassword: '', newPassword: '', confirmPassword: '' }
const actionLabels: Record<Action, string> = {
  profile: 'Saving display name…', email: 'Requesting an email change…', password: 'Changing password…',
  resend: 'Requesting confirmation…', logout: 'Signing out…',
}
const formatExpiry = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function AccountSettingsPage() {
  const { user, updateUser, logout } = useAuth()
  const { currentHousehold } = useHouseholds()
  const { navigate, confirmNavigation } = useRouter()
  const userId = user?.id ?? ''
  const id = useId()
  const [saved, setSaved] = useState<AccountSettings | null>(null)
  const [baseline, setBaseline] = useState({ displayName: '', version: '' })
  const [name, setName] = useState('')
  const [emailForm, setEmailForm] = useState(emptyEmail)
  const [passwordForm, setPasswordForm] = useState(emptyPassword)
  const [action, setAction] = useState<Action | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [notices, setNotices] = useState<Partial<Record<Action, string>>>({})
  const [requiresReload, setRequiresReload] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const profileDirty = name !== baseline.displayName
  const hasEdits = profileDirty || Boolean(emailForm.newEmail || emailForm.currentPassword ||
    passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword)
  const confirmDiscard = useUnsavedChangesGuard(hasEdits || action !== null, 'You have unsaved account settings. Continue leaving or switching context? Edits are discarded if this page closes. An in-progress request may still finish.')
  const currentDraft = useRef({ profileDirty })
  currentDraft.current = { profileDirty }
  const loadState = usePageLoad(userId)
  const { run, markReady } = loadState
  const applyRead = useCallback((data: AccountSettings, discard: boolean) => {
    if (data.user.id !== userId) throw new Error('Your signed-in account changed. Sign in again before editing these settings.')
    setSaved(data)
    updateUser(data.user)
    if (discard || !currentDraft.current.profileDirty) {
      setName(data.user.displayName)
      setBaseline({ displayName: data.user.displayName, version: data.version })
    }
    if (discard) { setEmailForm(emptyEmail); setPasswordForm(emptyPassword) }
    setRequiresReload(false)
  }, [updateUser, userId])
  const load = useCallback(async (discard = false) => {
    if (!userId) return
    await run(getAccountSettings, data => applyRead(data, discard))
  }, [userId, run, applyRead])
  useEffect(() => { void load() }, [load])
  const busy = action !== null
  const canEdit = loadState.isFresh && !busy && !requiresReload
  const reload = () => {
    if (pending.current || !confirmDiscard()) return
    setErrors([])
    void load(true)
  }
  const write = async (nextAction: Action, operation: () => Promise<void>) => {
    if (pending.current || !canEdit) return
    pending.current = true
    setAction(nextAction)
    setErrors([])
    setNotices(current => ({ ...current, [nextAction]: undefined }))
    try { await operation() }
    catch (error) {
      if (active.current) {
        setErrors(getErrorMessages(error))
        if (error instanceof ApiError && [401, 403, 409].includes(error.status)) setRequiresReload(true)
      }
    } finally {
      pending.current = false
      if (active.current) {
        // Do not retain or persist password values after an attempted save.
        if (nextAction === 'email') setEmailForm(current => ({ ...current, currentPassword: '' }))
        if (nextAction === 'password') setPasswordForm(emptyPassword)
        setAction(null)
      }
    }
  }
  const saveName = (event: FormEvent) => {
    event.preventDefault()
    if (!profileDirty || !name.trim()) return
    void write('profile', async () => {
      const data = await saveDisplayName(name.trim(), baseline.version)
      if (!active.current) return
      applyRead(data, false)
      setName(data.user.displayName)
      setBaseline({ displayName: data.user.displayName, version: data.version })
      markReady()
      setNotices(current => ({ ...current, profile: 'Display name saved.' }))
    })
  }
  const saveEmail = (event: FormEvent) => {
    event.preventDefault()
    if (!canEdit) return
    if (emailForm.newEmail.trim().toLowerCase() === saved?.user.email.toLowerCase()) {
      setErrors(['Enter a different email address.'])
      setEmailForm(current => ({ ...current, currentPassword: '' }))
      return
    }
    void write('email', async () => {
      const result = await requestEmailChange(emailForm.newEmail.trim(), emailForm.currentPassword)
      if (!active.current) return
      setEmailForm(emptyEmail)
      setNotices(current => ({ ...current, email: `Email-change request submitted. ${result.message} Your current email stays in use until the replacement is confirmed.` }))
      // A failed follow-up read only offers a read retry, never repeats the request.
      await load()
    })
  }
  const savePassword = (event: FormEvent) => {
    event.preventDefault()
    if (!canEdit) return
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrors(['The new passwords do not match. Re-enter your passwords to try again.'])
      setPasswordForm(emptyPassword)
      return
    }
    void write('password', async () => {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword)
      if (!active.current) return
      setPasswordForm(emptyPassword)
      setEmailForm(current => ({ ...current, currentPassword: '' }))
      setNotices(current => ({ ...current, password: 'Password changed. You remain signed in; other sessions must sign in again. Older confirmation links are invalid, so request a fresh link for any pending email change.' }))
      await load()
    })
  }
  const resend = () => { void write('resend', async () => {
    const result = await resendConfirmation()
    if (active.current) setNotices(current => ({ ...current, resend: result.message }))
  }) }
  const signOut = async () => {
    if (pending.current || !confirmNavigation()) return
    pending.current = true
    setAction('logout')
    setErrors([])
    try { await logout(); navigate('/login', { replace: true, bypassBlocker: true }) }
    catch (error) { if (active.current) setErrors(getErrorMessages(error)) }
    finally { pending.current = false; if (active.current) setAction(null) }
  }
  const cancelProfile = () => {
    if (pending.current || !profileDirty || !window.confirm('Discard your unsaved display name?')) return
    setName(baseline.displayName)
    setErrors([])
  }
  const cancelEmail = () => {
    if (pending.current || !window.confirm('Discard this unsaved email-change form? This does not cancel a submitted request.')) return
    setEmailForm(emptyEmail)
    setErrors([])
  }
  const cancelPassword = () => {
    if (pending.current || !window.confirm('Discard your unsaved password entries?')) return
    setPasswordForm(emptyPassword)
    setErrors([])
  }
  const returnTo = !user?.emailConfirmed ? '/verify-email' : currentHousehold ? '/dashboard' : '/household/setup'
  const returnLabel = !user?.emailConfirmed ? 'Return to confirmation' : currentHousehold ? 'Return to dashboard' : 'Return to household setup'
  return <main className="management-page" aria-busy={loadState.status === 'loading'}>
    <section className="management-content narrow-management-content">
      <header className="page-title-row">
        <div><p className="eyebrow">Your account</p><h1>Account settings</h1><p>Manage your own profile and sign-in details, independent of any household.</p></div>
        <AppLink className="header-link" to={returnTo} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault() }}>{returnLabel}</AppLink>
      </header>
      <p className="field-help">Security changes and pending email details are private and are not added to shared household activity. Your display name is visible to household members.</p>
      <PageLoadFeedback subject="account settings" status={loadState.status} errors={loadState.errors} onReload={reload} disabled={busy} />
      <ErrorSummary errors={errors} />
      {action && <p role="status">{actionLabels[action]}</p>}
      {requiresReload && <p className="field-help">Your safe form values are kept. Reload before saving again; you will be asked before discarding edits. Re-enter passwords when retrying.</p>}
      {loadState.hasData && saved && <div className="account-settings-stack">
        <form className="account-settings-card" aria-labelledby={`${id}-profile`} onSubmit={saveName}>
          <h2 id={`${id}-profile`}>Display name</h2>
          <label htmlFor={`${id}-name`}>Display name</label>
          <input id={`${id}-name`} autoComplete="name" maxLength={100} required value={name} disabled={!canEdit} onChange={event => setName(event.target.value)} />
          {notices.profile && <p className="success-summary" role="status">{notices.profile}</p>}
          <div className="household-settings-actions">
            <button type="submit" className="primary-button" disabled={!canEdit || !profileDirty || !name.trim()}>Save display name</button>
            <button type="button" className="secondary-button" disabled={busy || !profileDirty} onClick={cancelProfile}>Cancel name changes</button>
          </div>
        </form>
        <section className="account-settings-card" aria-labelledby={`${id}-email`}>
          <h2 id={`${id}-email`}>Email and verification</h2>
          <dl className="account-settings-details">
            <div><dt>Current email</dt><dd>{saved.user.email}</dd></div>
            <div><dt>Verification status</dt><dd>{saved.user.emailConfirmed ? 'Verified' : 'Not verified — confirm your address to access the app.'}</dd></div>
          </dl>
          {!saved.user.emailConfirmed && <>
            <p>Your existing data is kept unchanged while verification is required.</p>
            <button className="secondary-button" type="button" disabled={!canEdit} onClick={resend}>Send current-email confirmation</button>
            {notices.resend && <p className="notice-card" role="status">{notices.resend}</p>}
          </>}
          {saved.pendingEmailChange ? <div className="notice-card" role="note" aria-label="Pending email replacement">
            <strong>Pending replacement email</strong><p className="account-email-address">{saved.pendingEmailChange.email}</p>
            <p>{saved.pendingEmailChange.isExpired ? 'This request has expired. Enter the address and current password below to request a fresh link.' : `Awaiting confirmation. The request expires ${formatExpiry(saved.pendingEmailChange.expiresAtUtc)}.`}</p>
            <p>The current email remains your sign-in address. A pending request does not guarantee eligibility or delivery; if no message arrives, wait a minute, then explicitly request again.</p>
          </div> : <p className="field-help">No replacement email has been requested.</p>}
          {notices.email && <p className="notice-card" role="status">{notices.email}</p>}
          <form aria-labelledby={`${id}-change-email`} onSubmit={saveEmail}>
            <h3 id={`${id}-change-email`}>Request an email change</h3>
            <label htmlFor={`${id}-new-email`}>New email address</label>
            <input id={`${id}-new-email`} type="email" autoComplete="email" maxLength={256} required value={emailForm.newEmail} disabled={!canEdit} onChange={event => setEmailForm(current => ({ ...current, newEmail: event.target.value }))} />
            <label htmlFor={`${id}-email-password`}>Current password for email change</label>
            <input id={`${id}-email-password`} type="password" autoComplete="current-password" maxLength={128} required value={emailForm.currentPassword} disabled={!canEdit} onChange={event => setEmailForm(current => ({ ...current, currentPassword: event.target.value }))} />
            <p className="field-help">The new address must be confirmed using its email link. Your current email and existing data stay unchanged until then. Requesting a new link replaces the previous request; wait one minute between requests.</p>
            <div className="household-settings-actions">
              <button type="submit" className="primary-button" disabled={!canEdit || !emailForm.newEmail || !emailForm.currentPassword}>Request email change</button>
              <button type="button" className="secondary-button" disabled={busy || !(emailForm.newEmail || emailForm.currentPassword)} onClick={cancelEmail}>Clear email form</button>
            </div>
          </form>
        </section>
        <form className="account-settings-card" aria-labelledby={`${id}-password`} onSubmit={savePassword}>
          <h2 id={`${id}-password`}>Password</h2>
          {notices.password && <p className="success-summary" role="status">{notices.password}</p>}
          <label htmlFor={`${id}-current-password`}>Current password for password change</label>
          <input id={`${id}-current-password`} type="password" autoComplete="current-password" maxLength={128} required value={passwordForm.currentPassword} disabled={!canEdit} onChange={event => setPasswordForm(current => ({ ...current, currentPassword: event.target.value }))} />
          <label htmlFor={`${id}-new-password`}>New password</label>
          <input id={`${id}-new-password`} type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby={`${id}-password-help`} required value={passwordForm.newPassword} disabled={!canEdit} onChange={event => setPasswordForm(current => ({ ...current, newPassword: event.target.value }))} />
          <label htmlFor={`${id}-confirm-password`}>Confirm new password</label>
          <input id={`${id}-confirm-password`} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={passwordForm.confirmPassword} disabled={!canEdit} onChange={event => setPasswordForm(current => ({ ...current, confirmPassword: event.target.value }))} />
          <p id={`${id}-password-help`} className="field-help">Use at least 12 characters. Passwords are never saved in browser storage and are cleared after a save attempt. Other sessions must sign in again after a successful password change.</p>
          <div className="household-settings-actions">
            <button type="submit" className="primary-button" disabled={!canEdit || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}>Change password</button>
            <button type="button" className="secondary-button" disabled={busy || !(passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword)} onClick={cancelPassword}>Clear password form</button>
          </div>
        </form>
      </div>}
      <div className="household-settings-actions"><button className="text-button" type="button" disabled={busy} onClick={() => void signOut()}>Sign out</button></div>
    </section>
  </main>
}
