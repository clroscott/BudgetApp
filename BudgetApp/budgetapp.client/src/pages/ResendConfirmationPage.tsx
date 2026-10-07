import { useRef, useState } from 'react'
import { resendConfirmation } from '../auth/authApi'
import { getErrorMessages } from '../auth/errorMessages'
import { getSafeReturnPath } from '../auth/returnPath'
import { useAuth } from '../auth/useAuth'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function ResendConfirmationPage() {
  const { user, refresh, logout } = useAuth()
  const { navigate } = useRouter()
  const [action, setAction] = useState<'send' | 'check' | 'logout' | null>(null)
  const busy = action !== null
  const pending = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const requestedReturn = getSafeReturnPath()
  const returnTo = requestedReturn && !['/verify-email', '/resend-confirmation', '/confirm-email', '/confirm-email-change']
    .includes(requestedReturn.split('?')[0]) ? requestedReturn : '/dashboard'
  const request = async () => {
    if (pending.current) return
    pending.current = true
    setAction('send')
    setErrors([])
    try { setMessage((await resendConfirmation()).message) }
    catch (error) { setErrors(getErrorMessages(error)) }
    finally { pending.current = false; setAction(null) }
  }
  const checkStatus = async () => {
    if (pending.current) return
    pending.current = true
    setAction('check')
    try { await refresh() }
    finally { pending.current = false; setAction(null) }
  }
  const signOut = async () => {
    if (pending.current) return
    pending.current = true
    setAction('logout')
    setErrors([])
    try { await logout(); navigate('/login', { replace: true }) }
    catch (error) { setErrors(getErrorMessages(error)) }
    finally { pending.current = false; setAction(null) }
  }
  return (
    <main className="auth-page"><section className="auth-card" aria-labelledby="resend-heading">
      <header className="auth-header auth-header-centered"><BrandLogo /><h1 id="resend-heading">Confirm your email</h1></header>
      <ErrorSummary errors={errors} />
      {!user ? <>
        <p>Sign in to request a link for your own account. Existing users can confirm their address here too.</p>
        <AppLink className="primary-button" to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Sign in</AppLink>
        <p><AppLink to="/forgot-password">Forgot your password?</AppLink></p>
      </> : user.emailConfirmed ? <>
        <p role="status">{user.email} is already confirmed.</p><AppLink to={returnTo}>Continue</AppLink>
      </> : <>
        <p>Confirm <strong>{user.email}</strong> to access MC Budget.</p>
        <div className="notice-card" role="note" aria-label="Your data is safe">
          <strong>Your data is safe</strong>
          <p>Existing budgets, transactions, and household memberships are kept unchanged. Access resumes after you confirm your email.</p>
        </div>
        {message && <div className="notice-card" role="status"><h2>Check your email</h2><p>{message}</p></div>}
        <p>Links expire after one hour. A new link replaces the previous one. Wait one minute between requests.</p>
        <button className="primary-button" disabled={busy} onClick={() => void request()}>{action === 'send' ? 'Requesting…' : 'Send confirmation link'}</button>
        <p>Confirmed in another tab? Your status updates when you return here. You can also check it below.</p>
        <button className="secondary-button" disabled={busy} onClick={() => void checkStatus()}>{action === 'check' ? 'Checking…' : 'Check confirmation status'}</button>
        <p>Check your spam folder. If messages still do not arrive, contact the person who manages this installation.</p>
        <p><AppLink to="/forgot-password">Recover your account</AppLink></p>
        <button className="text-button" disabled={busy} onClick={() => void signOut()}>{action === 'logout' ? 'Signing out…' : 'Sign out'}</button>
      </>}
    </section></main>
  )
}
