import { PageFrame } from '../components/PageFrame'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { getSafeReturnPath } from '../auth/returnPath'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { HouseholdSectionNav } from '../components/HouseholdSectionNav'
import { usePageLoad } from './usePageLoad'
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
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { useUnsavedNativeForm } from '../routing/useUnsavedForm'

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function HouseholdManagementPage() {
  const {
    currentHousehold,
    households,
    refresh,
    selectHousehold,
  } = useHouseholds()
  const { navigate, confirmNavigation } = useRouter()
  const inviteGuard = useUnsavedNativeForm('Discard the household invitation details you entered?')
  const [management, setManagement] =
    useState<HouseholdMemberManagement | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [exitCompleted, setExitCompleted] = useState(false)
  const loadState = usePageLoad(currentHousehold?.id ?? '')
  const { run } = loadState
  const canChange = loadState.isFresh && !isSaving && !exitCompleted

  const load = useCallback(async () => {
    if (!currentHousehold) return

    setErrors([])
    return await run(() => getHouseholdMembers(currentHousehold.id), setManagement)
  }, [currentHousehold, run])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentHousehold) return null

  const availableRoles: HouseholdInvitationRole[] =
    currentHousehold.role === 'Owner'
      ? ['Admin', 'Editor', 'Viewer']
      : ['Editor', 'Viewer']

  const runChange = async (change: () => Promise<{ emailDelivered?: boolean }>) => {
    if (!canChange) return false
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

    if (succeeded) {
      form.reset()
      inviteGuard.markClean()
    }
  }

  const finishExit = async (operation: () => Promise<void>) => {
    if (!canChange) return
    setIsSaving(true)
    setErrors([])
    setNotice(null)
    let committed = false
    try {
      await operation()
      committed = true
      inviteGuard.markClean()
      setExitCompleted(true)
      await refresh()
      navigate(getSafeReturnPath() ?? '/dashboard', { replace: true, bypassBlocker: true })
    } catch (error) {
      if (committed) setNotice('Household change saved, but your household list could not be refreshed. Retry loading the list; do not repeat the change.')
      setErrors(getErrorMessages(error))
      setIsSaving(false)
    }
  }

  const retryExitRefresh = async () => {
    if (isSaving) return
    setIsSaving(true)
    setErrors([])
    try {
      await refresh()
      navigate(getSafeReturnPath() ?? '/dashboard', { replace: true, bypassBlocker: true })
    } catch (error) { setErrors(getErrorMessages(error)); setIsSaving(false) }
  }

  const confirmLeave = () => {
    if (!confirmNavigation()) return
    if (!window.confirm(
      `Leave ${currentHousehold.name}? You will lose access to its shared data.`,
    )) return

    void finishExit(() => leaveHousehold(currentHousehold.id))
  }

  const confirmDelete = () => {
    if (!confirmNavigation()) return
    const enteredName = window.prompt(
      `This permanently deletes the unused household and its default setup. ` +
      `Type "${currentHousehold.name}" to continue.`,
    )
    if (enteredName !== currentHousehold.name) return

    void finishExit(() => deleteUnusedHousehold(currentHousehold.id))
  }

  return (
    <PageFrame>
        <HouseholdSectionNav current="members" />
        <header className="page-title-row">
          <div>
            <p className="eyebrow">Household</p>
            <h1>{currentHousehold.name}</h1>
            <p>Review members and manage invitations to your shared budget.</p>
          </div>
          <AppLink className="primary-link-button" to="/households/new">
            Create household
          </AppLink>
        </header>

        <ErrorSummary errors={errors} />
        {notice && <div className="success-summary" role="status">{notice}</div>}
        {exitCompleted && <button className="secondary-button" type="button" disabled={isSaving}
          onClick={() => void retryExitRefresh()}>Retry household list</button>}
        {exitCompleted && isSaving && <p role="status">Refreshing your household list…</p>}
        {!exitCompleted && <PageLoadFeedback subject="household details" status={loadState.status} errors={loadState.errors}
          disabled={isSaving} onReload={() => void load()} />}

        <section className="household-management-section">
          <div className="household-section-heading">
            <div>
              <h2>Your households</h2>
              <p>
                Each household has separate members, accounts, categories,
                imports, and budgets.
              </p>
            </div>
            <span className="status-pill">{households.length}</span>
          </div>

          {exitCompleted && <p>Your household list may be out of date until it is refreshed.</p>}

          <div className="household-member-list">
            {households.map(household => {
              const isCurrent = household.id === currentHousehold.id
              return (
                <article className="household-member-row" key={household.id}>
                  <div>
                    <strong>{household.name}</strong>
                    <p>
                      {household.defaultCurrency} · {household.role}
                    </p>
                  </div>
                  <div className="household-member-meta">
                    {isCurrent ? (
                      <span className="status-pill">Current</span>
                    ) : (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={exitCompleted}
                        onClick={() => {
                          if (selectHousehold(household.id)) {
                            setNotice(`Switched to ${household.name}.`)
                          }
                        }}
                      >
                        Switch
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {!exitCompleted && loadState.hasData && management?.canManageInvitations && (
          <form
            {...inviteGuard.formProps}
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
                disabled={!canChange}
              />
            </label>
            <label>
              <span>Role</span>
              <select name="role" defaultValue="Editor" disabled={!canChange}>
                {availableRoles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={!canChange}
            >
              {isSaving ? 'Saving…' : 'Send invitation'}
            </button>
            <p className="field-help household-invite-help">
              Admins can manage most household settings. Editors can manage
              financial data. Viewers have read-only access.
            </p>
          </form>
        )}

        {!exitCompleted && <section className="household-management-section">
          <div className="household-section-heading">
            <div>
              <h2>Members</h2>
              <p>People who currently have access to this household.</p>
            </div>
            <span className="status-pill">
              {loadState.hasData ? management?.members.length ?? 0 : '—'}
            </span>
          </div>

          {!loadState.hasData ? null : management?.members.length ? (
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
            <p className="empty-state">{loadState.isFresh ? 'No household members were found.'
              : 'No members were listed in the last successful response. The current list is unavailable.'}</p>
          )}
        </section>}

        {!exitCompleted && loadState.hasData && management?.canManageInvitations && (
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
                              disabled={!canChange}
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
                              disabled={!canChange}
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
              <p className="empty-state">{loadState.isFresh ? 'No invitations have been created.'
                : 'No invitations were listed in the last successful response. The current list is unavailable.'}</p>
            )}
          </section>
        )}

        {!exitCompleted && loadState.hasData && management && (
          <section className="household-management-section household-exit-section">
            <div className="household-section-heading">
              <div>
                <h2>Leave or delete this household</h2>
                <p>
                  Leaving removes only your membership in{' '}
                  {currentHousehold.name}. Your other household memberships are
                  not affected.
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
                  disabled={!canChange}
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
                  disabled={!canChange}
                  onClick={confirmDelete}
                >
                  Delete unused household
                </button>
              </div>
            )}

            {management.exitOptions.blockedReason && (
              <div className="household-exit-blocked">
                <strong>An ownership change is required first</strong>
                <p>{management.exitOptions.blockedReason}</p>
                <p>
                  <strong>Planned feature:</strong> ownership transfer will
                  allow the last Owner to assign responsibility before leaving.
                </p>
              </div>
            )}
          </section>
        )}
    </PageFrame>
  )
}
