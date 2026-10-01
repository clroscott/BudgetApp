import { useEffect, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { BrandMark } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { HouseholdForm } from '../households/HouseholdForm'
import type { CreateHouseholdRequest } from '../households/householdApi'
import {
  acceptPendingHouseholdInvitation,
  getPendingHouseholdInvitations,
  type HouseholdInvitationForUser,
} from '../households/householdInvitationApi'
import { useHouseholds } from '../households/useHouseholds'
import { useRouter } from '../routing/useRouter'

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
  timeStyle: 'short',
})

export function HouseholdSetupPage() {
  const { user, logout } = useAuth()
  const { createHousehold, refresh } = useHouseholds()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true)
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<
    string | null
  >(null)
  const [invitations, setInvitations] = useState<
    HouseholdInvitationForUser[]
  >([])
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    const loadInvitations = async () => {
      try {
        const pending = await getPendingHouseholdInvitations()
        if (!cancelled) setInvitations(pending)
      } catch (error) {
        if (!cancelled) setErrors(getErrorMessages(error))
      } finally {
        if (!cancelled) setIsLoadingInvitations(false)
      }
    }

    void loadInvitations()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (request: CreateHouseholdRequest) => {
    setIsSubmitting(true)
    setErrors([])

    try {
      await createHousehold(request)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setIsSigningOut(true)
    setErrors([])

    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
      setIsSigningOut(false)
    }
  }

  const handleAcceptInvitation = async (invitationId: string) => {
    setAcceptingInvitationId(invitationId)
    setErrors([])

    try {
      const household = await acceptPendingHouseholdInvitation(invitationId)
      await refresh(household.id)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
      setAcceptingInvitationId(null)
    }
  }

  const isBusy = isSubmitting || acceptingInvitationId !== null

  return (
    <main className="auth-page">
      <section
        className="auth-card household-setup-card"
        aria-labelledby="household-heading"
      >
        <header className="auth-header">
          <div className="setup-header-row">
            <BrandMark />
            <button
              className="text-button"
              type="button"
              disabled={isSigningOut}
              onClick={() => void handleLogout()}
            >
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
          <p className="eyebrow">Household setup</p>
          <h1 id="household-heading">Welcome, {user?.displayName}</h1>
          <p>Join a household you've been invited to, or create a new one.</p>
        </header>

        <ErrorSummary errors={errors} />

        {isLoadingInvitations && (
          <p className="empty-state">Checking for invitations...</p>
        )}

        {invitations.length > 0 && (
          <section
            className="setup-invitations"
            aria-labelledby="pending-invitations-heading"
          >
            <div className="setup-section-heading">
              <div>
                <p className="eyebrow">Invited household</p>
                <h2 id="pending-invitations-heading">Your invitations</h2>
              </div>
              <span className="count-badge">{invitations.length}</span>
            </div>
            <p className="setup-section-help">
              These invitations match <strong>{user?.email}</strong>.
            </p>
            <div className="setup-invitation-list">
              {invitations.map(invitation => (
                <article className="setup-invitation" key={invitation.id}>
                  <div>
                    <h3>{invitation.householdName}</h3>
                    <p>
                      Invited by {invitation.inviterDisplayName} as{' '}
                      <strong>{invitation.role}</strong>
                    </p>
                    <p className="field-help">
                      Expires {dateTimeFormatter.format(
                        new Date(invitation.expiresAtUtc),
                      )}
                    </p>
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleAcceptInvitation(invitation.id)}
                  >
                    {acceptingInvitationId === invitation.id
                      ? 'Joining...'
                      : 'Join household'}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {!isLoadingInvitations && invitations.length > 0 && (
          <div className="setup-divider">
            <span>Or create a new household</span>
          </div>
        )}

        <HouseholdForm
          isSubmitting={isBusy}
          onSubmit={handleSubmit}
        />
      </section>
    </main>
  )
}
