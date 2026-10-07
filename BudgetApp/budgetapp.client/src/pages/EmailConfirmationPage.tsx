import { useRef, useState } from 'react'
import { confirmEmail } from '../auth/authApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function EmailConfirmationPage() {
  const { user, updateUser, logout } = useAuth()
  const { path, navigate } = useRouter()
  const changing = path === '/confirm-email-change'
  const query = new URLSearchParams(window.location.search)
  const userId = query.get('userId') ?? ''
  const token = query.get('token') ?? ''
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const loginPath = `/login?returnTo=${encodeURIComponent(path + window.location.search)}`

  const confirm = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setErrors([])
    try {
      updateUser(await confirmEmail(userId, token, changing))
      setSuccess(true)
      // Remove the bearer token from this history entry after it has been consumed.
      navigate(path, { replace: true })
    } catch (error) { setErrors(getErrorMessages(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  const switchAccount = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setErrors([])
    try { await logout(); navigate(loginPath, { replace: true }) }
    catch (error) { setErrors(getErrorMessages(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  return (
    <main className="auth-page"><section className="auth-card" aria-labelledby="confirm-email-heading">
      <header className="auth-header auth-header-centered"><BrandLogo />
        <h1 id="confirm-email-heading">{changing ? 'Confirm your new email' : 'Confirm your email'}</h1>
      </header>
      <ErrorSummary errors={errors} />
      {success ? <div className="notice-card" role="status">
        <h2>Email confirmed</h2><p>{user?.email} is verified. You can now access MC Budget and invitations sent to this address.</p>
        <AppLink to="/household">Continue to your household</AppLink>
      </div> : !changing && user?.emailConfirmed && (!userId || user.id === userId) ? <>
        <p role="status">Your current account email, {user.email}, is already confirmed.</p>
        <AppLink to="/household">Continue to your household</AppLink>
      </> : !userId || !token ? <>
        <p>This confirmation link is incomplete. Request a new link.</p>
        {changing ? <p>Repeat your email-change request to receive a complete link.</p> : <AppLink to="/resend-confirmation">Request confirmation</AppLink>}
      </> : !user ? <>
        <p>Sign in to the account that requested this link before confirming it. Opening this page does not change your account.</p>
        <AppLink className="primary-button" to={loginPath}>Sign in to confirm</AppLink>
        <p>If you did not create the account, reset its password first. Do not confirm an unexpected request.</p>
        <AppLink to="/forgot-password">Reset your password</AppLink>
      </> : user.id !== userId ? <>
        <p>You are signed in as {user.email}. This link belongs to a different account. Sign in to the account that requested it.</p>
        <button className="secondary-button" disabled={busy} onClick={() => void switchAccount()}>Sign in with another account</button>
      </> : <>
        <p>Signed in as {user.email}.</p>
        <p>{changing ? 'Confirm the new address that received this link. Your old address remains in use until confirmation succeeds.' : 'Confirm that you own this address to access MC Budget. Your existing data is kept unchanged.'}</p>
        <p>Links expire after one hour. Only the latest link can be used.</p>
        <button className="primary-button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm email address'}</button>
        {!changing && <p><AppLink to="/resend-confirmation">Request a new confirmation link</AppLink></p>}
        {changing && <p>For a new email-change link, request the change again from account settings when available. Resending confirmation for your current address does not confirm the new address.</p>}
      </>}
    </section></main>
  )
}
