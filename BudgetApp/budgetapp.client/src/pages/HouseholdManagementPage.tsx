import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { getSafeReturnPath } from '../auth/returnPath'
import { ErrorSummary } from '../components/ErrorSummary'
import {
  deleteUnusedHousehold,
  leaveHousehold,
} from '../households/householdApi'
import {
  createHouseholdInvitation,
  getHouseholdMembers,
  resendHouseholdInvitation,
  revokeHouseholdInvitation,
  type HouseholdInvitationRole,
  type HouseholdMemberManagement,
} from '../households/householdInvitationApi'
import { useHouseholds } from '../households/useHouseholds'
import { useRouter } from '../routing/useRouter'

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function HouseholdManagementPage() {
  const { currentHousehold, refresh } = useHouseholds()
  const { navigate } = useRouter()
  const [management, setManagement] =
    useState<HouseholdMemberManagement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!currentHousehold) return

    setIsLoading(true)
    setErrors([])
    try {
      setManagement(await getHouseholdMembers(currentHousehold.id))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsLoading(false)
    }
  }, [currentHousehold])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentHousehold) return null

  const availableRoles: HouseholdInvitationRole[] =
    currentHousehold.role === 'Owner'
      ? ['Admin', 'Editor', 'Viewer']
      : ['Editor', 'Viewer']

  const runChange = async (change: () => Promise<{ emailDelivered?: boolean }>) => {
    setIsSaving(true)
    setErrors([])
    setNotice(null)
    try {
      const result = await change()
      setNotice(result.emailDelivered === false
        ? 'The invitation was saved, but email delivery failed. You can resend it.'
        : 'Household invitations were updated.')
      await load()
      return true
    } catch (error) {
      setErrors(getErrorMessages(error))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const succeeded = await runChange(() => createHouseholdInvitation(
      currentHousehold.id,
      {
        email: String(data.get('email') ?? ''),
        role: String(data.get('role') ?? 'Viewer') as HouseholdInvitationRole,
      },
    ))

    if (succeeded) form.reset()
  }

  const finishExit = async (operation: () => Promise<void>) => {
    setIsSaving(true)
    setErrors([])
    setNotice(null)
    try {
      await operation()
      await refresh()
      navigate(getSafeReturnPath() ?? '/household/setup', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
      setIsSaving(false)
    }
  }

  const confirmLeave = () => {
    if (!window.confirm(
      `Leave ${currentHousehold.name}? You will lose access to its shared data.`,
    )) return

    void finishExit(() => leaveHousehold(currentHousehold.id))
  }

  const confirmDelete = () => {
    const enteredName = window.prompt(
      `This permanently deletes the unused household and its default setup. ` +
      `Type "${currentHousehold.name}" to continue.`,
    )
    if (enteredName !== currentHousehold.name) return

    void finishExit(() => deleteUnusedHousehold(currentHousehold.id))
  }

  return (
    <main className="management-page">
      <div className="management-content">
        <header className="page-title-row">
          <div>
            <span className="eyebrow">Household</span>
            <h1>{currentHousehold.name}</h1>
            <p>Review members and manage invitations to your shared budget.</p>
          </div>
        </header>

        <ErrorSummary errors={errors} />
        {notice && <div className="success-summary" role="status">{notice}</div>}

        {management?.canManageInvitations && (
          <form
            className="household-invite-form"
            onSubmit={(event) => void handleInvite(event)}
          >
            <div className="household-section-heading">
              <div>
                <h2>Invite someone</h2>
                <p>Invitations expire after seven days.</p>
              </div>
            </div>
            <label>
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={256}
                required
              />
            </label>
            <label>
              <span>Role</span>
              <select name="role" defaultValue="Editor">
                {availableRoles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Send invitation'}
            </button>
            <p className="field-help household-invite-help">
              Admins can manage most household settings. Editors can manage
              financial data. Viewers have read-only access.
            </p>
          </form>
        )}

        <section className="household-management-section">
          <div className="household-section-heading">
            <div>
              <h2>Members</h2>
              <p>People who currently have access to this household.</p>
            </div>
            <span className="status-pill">
              {management?.members.length ?? 0}
            </span>
          </div>

          {isLoading ? (
            <p className="empty-state">Loading household members…</p>
          ) : management?.members.length ? (
            <div className="household-member-list">
              {management.members.map(member => (
                <article className="household-member-row" key={member.userId}>
                  <div>
                    <strong>{member.displayName}</strong>
                    <p>{member.email}</p>
                  </div>
                  <div className="household-member-meta">
                    <span className="status-pill">{member.role}</span>
                    <small>{member.status}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No household members were found.</p>
          )}
        </section>

        {management?.canManageInvitations && (
          <section className="household-management-section">
            <div className="household-section-heading">
              <div>
                <h2>Invitations</h2>
                <p>Pending, expired, accepted, and revoked invitations.</p>
              </div>
              <span className="status-pill">
                {management.invitations.length}
              </span>
            </div>

            {management.invitations.length ? (
              <div className="household-member-list">
                {management.invitations.map(invitation => {
                  const canAct =
                    invitation.status === 'Pending' ||
                    invitation.status === 'Expired'
                  return (
                    <article
                      className="household-member-row"
                      key={invitation.id}
                    >
                      <div>
                        <strong>{invitation.email}</strong>
                        <p>
                          {invitation.role} · Expires{' '}
                          {formatter.format(new Date(invitation.expiresAtUtc))}
                        </p>
                      </div>
                      <div className="household-invitation-actions">
                        <span className="status-pill">{invitation.status}</span>
                        {canAct && (
                          <>
                            <button
                              className="text-button"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void runChange(() =>
                                resendHouseholdInvitation(
                                  currentHousehold.id,
                                  invitation.id,
                                ))}
                            >
                              Resend
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void runChange(async () => {
                                await revokeHouseholdInvitation(
                                  currentHousehold.id,
                                  invitation.id,
                                )
                                return {}
                              })}
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="empty-state">No invitations have been created.</p>
            )}
          </section>
        )}

        {management && (
          <section className="household-management-section household-exit-section">
            <div className="household-section-heading">
              <div>
                <h2>Changing households</h2>
                <p>
                  Households are invitation-only. Ask an Owner or Admin of the
                  other household to invite your account email before leaving.
                </p>
              </div>
            </div>

            {management.exitOptions.canLeave && (
              <div className="household-exit-action">
                <div>
                  <strong>Leave household</strong>
                  <p>
                    Your account will lose access. The household and its data
                    remain available to its Owners.
                  </p>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  disabled={isSaving}
                  onClick={confirmLeave}
                >
                  Leave household
                </button>
              </div>
            )}

            {management.exitOptions.canDeleteUnused && (
              <div className="household-exit-action">
                <div>
                  <strong>Delete unused household</strong>
                  <p>
                    This household has only its Owner and unchanged defaults.
                    Deletion is permanent.
                  </p>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  disabled={isSaving}
                  onClick={confirmDelete}
                >
                  Delete unused household
                </button>
              </div>
            )}

            {management.exitOptions.blockedReason && (
              <div className="household-exit-blocked">
                <strong>Changing households is not available yet</strong>
                <p>{management.exitOptions.blockedReason}</p>
                <p>
                  <strong>Planned features:</strong> multiple-household
                  membership and switching, followed by ownership transfer,
                  household archival, and selected-data copying.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
