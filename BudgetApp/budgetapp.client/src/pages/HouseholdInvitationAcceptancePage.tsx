import { useEffect, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { EmailVerificationNotice } from '../components/EmailVerificationNotice'
import {
  acceptHouseholdInvitation,
  getHouseholdInvitationPreview,
  type HouseholdInvitationPreview,
} from '../households/householdInvitationApi'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
  timeStyle: 'short',
})

export function HouseholdInvitationAcceptancePage() {
  const { user } = useAuth()
  const { currentHousehold, refresh } = useHouseholds()
  const { navigate } = useRouter()
  const [preview, setPreview] = useState<HouseholdInvitationPreview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAccepting, setIsAccepting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [retry, setRetry] = useState(0)
  const token = new URLSearchParams(window.location.search).get('token') ?? ''

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!user?.emailConfirmed) return
      setIsLoading(true)
      setErrors([])
      if (!token) {
        setErrors(['This household invitation link is incomplete.'])
        setIsLoading(false)
        return
      }

      try {
        const result = await getHouseholdInvitationPreview(token)
        if (!cancelled) setPreview(result)
      } catch (error) {
        if (!cancelled) setErrors(getErrorMessages(error))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token, user?.id, user?.emailConfirmed, retry])

  const accept = async () => {
    setIsAccepting(true)
    setErrors([])
    try {
      const acceptedHousehold = await acceptHouseholdInvitation(token)
      await refresh(acceptedHousehold.id)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
      setIsAccepting(false)
    }
  }

  const returnPath =
    `/household-invitations/accept?token=${encodeURIComponent(token)}`
  const signInPath = `/login?returnTo=${encodeURIComponent(returnPath)}`
  const registerPath = `/register?returnTo=${encodeURIComponent(returnPath)}`

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="invitation-heading">
        <header className="auth-header auth-header-centered">
          <BrandLogo />
          <h1 id="invitation-heading">Household invitation</h1>
          <p>Review the invitation before joining a shared household.</p>
        </header>

        <ErrorSummary errors={errors} />

        <EmailVerificationNotice />
        {user?.emailConfirmed && isLoading && <p className="empty-state">Loading invitation…</p>}
        {user?.emailConfirmed && !isLoading && errors.length > 0 && <button className="secondary-button" onClick={() => setRetry(value => value + 1)}>Retry loading invitation</button>}

        {user?.emailConfirmed && preview && (
          <div className="invitation-preview">
            <div>
              <span>Household</span>
              <strong>{preview.householdName}</strong>
            </div>
            <div>
              <span>Invited by</span>
              <strong>{preview.inviterDisplayName}</strong>
            </div>
            <div>
              <span>Invited account</span>
              <strong>{preview.maskedEmail}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{preview.role}</strong>
            </div>
            <p>
              {preview.isAvailable
                ? `Expires ${formatter.format(new Date(preview.expiresAtUtc))}`
                : `Invitation status: ${preview.status}`}
            </p>
          </div>
        )}

        {!user && (
          <div className="invitation-auth-actions">
            <p>Sign in with the invited email address and confirm ownership before viewing this invitation, or create an account.</p>
            <AppLink className="primary-link-button" to={signInPath}>
              Sign in
            </AppLink>
            <AppLink className="secondary-link-button" to={registerPath}>
              Create account
            </AppLink>
          </div>
        )}

        {preview?.isAvailable && user?.emailConfirmed && (
          <div className="invitation-auth-actions">
            <p>
              You are signed in as <strong>{user.email}</strong>.
              The email must match the invitation.
            </p>
            {currentHousehold && (
              <p>
                Accepting adds this household alongside{' '}
                <strong>{currentHousehold.name}</strong>. It does not move or
                combine any financial data.
              </p>
            )}
            <button
              className="primary-button"
              type="button"
              disabled={isAccepting}
              onClick={() => void accept()}
            >
              {isAccepting ? 'Joining household…' : 'Accept invitation'}
            </button>
          </div>
        )}

        {user?.emailConfirmed && !isLoading && !preview && (
          <p className="auth-switch">
            <AppLink to="/login">Return to sign in</AppLink>
          </p>
        )}
      </section>
    </main>
  )
}
