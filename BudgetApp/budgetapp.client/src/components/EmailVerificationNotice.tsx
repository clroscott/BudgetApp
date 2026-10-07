import { useAuth } from '../auth/useAuth'
import { AppLink } from '../routing/AppLink'

export function EmailVerificationNotice() {
  const { user } = useAuth()
  if (!user || user.emailConfirmed) return null
  const returnTo = window.location.pathname + window.location.search
  return (
    <div className="notice-card email-verification-notice" role="note" aria-label="Email confirmation required">
      <strong>Confirm your email address</strong>
      <p>Confirm {user.email} to access MC Budget. Your existing data is kept unchanged.</p>
      <AppLink to={`/verify-email?returnTo=${encodeURIComponent(returnTo)}`}>Send a confirmation link</AppLink>
    </div>
  )
}
