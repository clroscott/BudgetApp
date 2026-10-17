import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { HouseholdManagementPage } from '../pages/HouseholdManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getHouseholdMembers, createHouseholdInvitation, resendHouseholdInvitation, revokeHouseholdInvitation,
  type HouseholdMemberManagement, type HouseholdInvitationItem, type HouseholdInvitationDispatch } from '../households/householdInvitationApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { invitationTutorialGate } from './invitationTutorialState'
import { deferred } from '../test/deferred'

vi.mock('../households/householdInvitationApi', async original => ({ ...await original<typeof import('../households/householdInvitationApi')>(),
  getHouseholdMembers: vi.fn(), createHouseholdInvitation: vi.fn(), resendHouseholdInvitation: vi.fn(), revokeHouseholdInvitation: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const invitation: HouseholdInvitationItem = { id: 'invitation-a', email: 'disposable@example.test', role: 'Viewer', status: 'Pending',
  createdAtUtc: '2026-10-16T12:00:00Z', lastSentAtUtc: '2026-10-16T12:00:00Z', expiresAtUtc: '2026-10-23T12:00:00Z' }
let management: HouseholdMemberManagement
function Routes() {
  const { path } = useRouter(); const tutorials = useTutorials()
  return <>{path === '/household' ? <><HouseholdManagementPage /><AppLink to="/tutorials">Leave invitations</AppLink></> : <TutorialHubPage />}
    <output data-testid="step">{tutorials.activeTutorial ? tutorials.activeStepIndex : 'inactive'}</output>
  </>
}
function show(role: 'Owner' | 'Admin' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture()
  households.currentHousehold = { ...households.currentHousehold!, role }
  if (role === 'Viewer') management = { ...management, canManageInvitations: false, invitations: [] }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}>
    <TutorialProvider><Routes /></TutorialProvider>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Invite a household member tutorial controls' })
async function click(name: string) {
  const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function start(selection: string) {
  const card = screen.getByRole('heading', { name: 'Invite a household member' }).closest('article')!
  const launch = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(launch.disabled).toBe(false)); fireEvent.click(launch); await step(0)
  const select = await screen.findByLabelText('Invitation or membership to review') as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: selection } }); await click('Use this choice')
}
async function finishReview() { for (let i = 1; i < 5; i++) await click('Next'); await step(5); await click('Continue with Household') }
function noMessages() { expect(createHouseholdInvitation).not.toHaveBeenCalled(); expect(resendHouseholdInvitation).not.toHaveBeenCalled(); expect(revokeHouseholdInvitation).not.toHaveBeenCalled() }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout()
  management = { canManageInvitations: true, members: [{ userId: 'test-user', displayName: 'Sample user', email: 'owner@example.test', role: 'Owner', status: 'Active', joinedAtUtc: null }],
    invitations: [structuredClone(invitation)], exitOptions: { canLeave: false, canDeleteUnused: false, blockedReason: 'Keep the owner safeguard' } }
  vi.mocked(getHouseholdMembers).mockImplementation(async () => structuredClone(management))
  vi.mocked(createHouseholdInvitation).mockImplementation(async (_hh, request) => {
    const saved = { ...invitation, ...request, id: 'created-invitation' }; management.invitations.push(saved)
    return { invitation: saved, emailDelivered: true }
  })
  vi.mocked(resendHouseholdInvitation).mockImplementation(async () => ({ invitation: structuredClone(management.invitations.at(-1)!), emailDelivered: true }))
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Household-invitation guided setup', () => {
  it.each(['Pending', 'Expired', 'Revoked', 'Accepted'])('reviews an existing %s invitation without another message or management write', async status => {
    management.invitations[0].status = status; show(); await start('invitation:invitation-a'); await finishReview(); noMessages()
    expect(window.location.pathname).toBe('/household'); await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('invite-household-member', 1, 'Completed', 5))
  })
  it.each(['review', 'member:test-user'])('supports Viewer %s without inaccessible invitation actions', async selection => {
    show('Viewer'); await start(selection)
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull(); expect(screen.queryByRole('option', { name: 'New invitation' })).toBeNull()
    await finishReview(); noMessages()
  })
  it.each([true, false])('sends only on the explicit page action and reports emailDelivered=%s honestly', async delivered => {
    show(); await start('new'); fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Viewer' } })
    await click('Next'); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new-disposable@example.test' } }); await click('Next'); await step(3)
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true); noMessages()
    const pending = deferred<HouseholdInvitationDispatch>(); vi.mocked(createHouseholdInvitation).mockReturnValueOnce(pending.promise)
    fireEvent.submit(document.getElementById('household-invite-create')!)
    expect((within(guide()).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { const saved = { ...invitation, id: 'created-invitation', email: 'new-disposable@example.test' }; management.invitations.push(saved); pending.resolve({ invitation: saved, emailDelivered: delivered }) })
    await click('Next'); await step(4)
    expect(within(guide()).getByRole('heading', { name: delivered ? 'Pending acceptance' : 'Saved—but email failed' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send invitation' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Next'); await click('Continue with Household')
    expect(createHouseholdInvitation).toHaveBeenCalledExactlyOnceWith('household-a', { email: 'new-disposable@example.test', role: 'Viewer' })
    expect(resendHouseholdInvitation).not.toHaveBeenCalled(); expect(revokeHouseholdInvitation).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain('new-disposable@example.test')
    expect(JSON.stringify(vi.mocked(saveTutorialProgress).mock.calls)).not.toContain('created-invitation')
  })
  it('limits Admin invitations to Editor/Viewer and treats Resend as a separate explicit action', async () => {
    show('Admin'); await start('new'); expect(screen.queryByRole('option', { name: 'Admin' })).toBeNull()
    await click('Next'); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new-disposable@example.test' } }); await click('Next')
    fireEvent.submit(document.getElementById('household-invite-create')!); await click('Next')
    expect(resendHouseholdInvitation).not.toHaveBeenCalled()
    const selected = document.querySelector('[data-tutorial-id="invite-tour-selected"]')!
    fireEvent.click(within(selected as HTMLElement).getByRole('button', { name: 'Resend' }))
    await click('Next'); await click('Return to tutorials')
    expect(createHouseholdInvitation).toHaveBeenCalledOnce(); expect(resendHouseholdInvitation).toHaveBeenCalledExactlyOnceWith('household-a', 'created-invitation')
    expect(revokeHouseholdInvitation).not.toHaveBeenCalled()
  })
  it('requires a fresh saved-list check and explicit selection after a lost send reply, never an automatic resend', async () => {
    show(); await start('new'); await click('Next'); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'lost-reply@example.test' } }); await click('Next')
    vi.mocked(createHouseholdInvitation).mockImplementationOnce(async (_hh, request) => { management.invitations.push({ ...invitation, ...request, id: 'lost-invitation' }); throw new Error('Lost reply') })
    fireEvent.submit(document.getElementById('household-invite-create')!); await screen.findByRole('button', { name: 'Check saved invitations' })
    expect((screen.getByLabelText('Invitation or membership to review') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved invitations' }))
    fireEvent.click(within(guide()).getByText('More details')); await click('Restart task selection'); await step(0)
    const select = screen.getByLabelText('Invitation or membership to review') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false)); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(select, { target: { value: 'invitation:lost-invitation' } }); await click('Use this choice'); await finishReview()
    expect(createHouseholdInvitation).toHaveBeenCalledOnce(); expect(resendHouseholdInvitation).not.toHaveBeenCalled(); expect(revokeHouseholdInvitation).not.toHaveBeenCalled()
  })
  it('keeps failed reads distinct from no members and preserves unsent input on Escape', async () => {
    const pending = deferred<HouseholdMemberManagement>(); vi.mocked(getHouseholdMembers).mockReturnValueOnce(pending.promise)
    show(); const card = screen.getByRole('heading', { name: 'Invite a household member' }).closest('article')!
    const launch = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
    await waitFor(() => expect(launch.disabled).toBe(false)); fireEvent.click(launch); await step(0)
    await act(async () => pending.reject(new Error('Synthetic member read failure')))
    expect(screen.queryByText('No household members were found.')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    const select = screen.getByLabelText('Invitation or membership to review') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: 'new' } }); await click('Use this choice')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'keep-draft@example.test' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('keep-draft@example.test')
    fireEvent.click(screen.getByRole('link', { name: 'Leave invitations' })); expect(window.confirm).toHaveBeenCalled(); expect(window.location.pathname).toBe('/household'); noMessages()
  })
  it('binds household/role/selection and refuses stale, dirty, pending and uncertain outcomes', () => {
    const page = { householdId: 'hh', fresh: true, busy: false, dirty: false, uncertain: false, selection: 'new', kind: 'new' as const,
      invitationId: 'inv-a', status: 'Pending', canManage: true, emailDelivered: true }
    const task = { householdId: 'hh', role: 'Owner', selection: 'new', invitationId: 'inv-a' }
    expect(invitationTutorialGate(4, 'hh', 'Owner', task, page).canNext).toBe(true)
    for (const changed of [{ fresh: false }, { busy: true }, { uncertain: true }, { dirty: true }, { selection: 'other' }, { invitationId: 'other' }, { canManage: false }])
      expect(invitationTutorialGate(4, 'hh', 'Owner', task, { ...page, ...changed }).canNext).toBe(false)
    expect(invitationTutorialGate(4, 'hh', 'Admin', task, page).canNext).toBe(false)
    expect(invitationTutorialGate(4, 'other', 'Owner', task, page).canNext).toBe(false)
  })
})
