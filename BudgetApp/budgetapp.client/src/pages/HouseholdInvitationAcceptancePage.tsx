import { useEffect, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
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
  const token = new URLSearchParams(window.location.search).get('token') ?? ''

  useEffect(() => {
    let cancelled = false

    const load = async () => {
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
  }, [token])

  const accept = async () => {
    setIsAccepting(true)
    setErrors([])
    try {
      await acceptHouseholdInvitation(token)
      await refresh()
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

        {isLoading && <p className="empty-state">Loading invitation…</p>}

        {preview && (
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

        {preview?.isAvailable && !user && (
          <div className="invitation-auth-actions">
            <p>Sign in or create the invited account to continue.</p>
            <AppLink className="primary-link-button" to={signInPath}>
              Sign in
            </AppLink>
            <AppLink className="secondary-link-button" to={registerPath}>
              Create account
            </AppLink>
          </div>
        )}

        {preview?.isAvailable && user && currentHousehold && (
          <div className="invitation-auth-actions">
            <p>
              You currently belong to <strong>{currentHousehold.name}</strong>.
              Leave or delete that household before accepting this invitation.
            </p>
            <AppLink
              className="secondary-link-button"
              to={`/household?returnTo=${encodeURIComponent(returnPath)}`}
            >
              Manage current household
            </AppLink>
          </div>
        )}

        {preview?.isAvailable && user && !currentHousehold && (
          <div className="invitation-auth-actions">
            <p>
              You are signed in as <strong>{user.email}</strong>.
              The email must match the invitation.
            </p>
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

        {!isLoading && !preview && (
          <p className="auth-switch">
            <AppLink to="/login">Return to sign in</AppLink>
          </p>
        )}
      </section>
    </main>
  )
}
