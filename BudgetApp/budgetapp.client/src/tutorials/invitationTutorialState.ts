import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { ReadTutorialControls } from './readTutorialState'
export const invitationTutorialKey = 'invite-household-member'
export interface InvitationTutorialPage {
  householdId: string
  fresh: boolean
  busy: boolean
  dirty: boolean
  uncertain: boolean
  selection: string | null
  kind: 'new' | 'invitation' | 'member' | 'review' | null
  invitationId: string | null
  status: string | null
  canManage: boolean
  emailDelivered: boolean | null
}
export interface InvitationTutorialTask { householdId: string; role: string; selection: string; invitationId?: string }
export interface InvitationTutorialControls extends ReadTutorialControls {
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const InvitationTutorialPageContext = createContext<((owner: symbol, page: InvitationTutorialPage | null) => void) | null>(null)
export function useInvitationTutorialPage(page: InvitationTutorialPage | null) {
  const publish = useContext(InvitationTutorialPageContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === invitationTutorialKey
  const [owner] = useState(() => Symbol('invitation tutorial page'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as InvitationTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
export function invitationTutorialGate(step: number, householdId: string | undefined, role: string | undefined,
  task: InvitationTutorialTask | null, page: InvitationTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message })
  if (step > 0 && (!task || task.householdId !== householdId || task.role !== role)) return blocked('Household or role changed. Start again to check the invitation.')
  if (!page || page.householdId !== householdId) return blocked('Return to Household to continue.')
  if (page.busy) return blocked('Working… Please wait.')
  if (page.uncertain) return blocked('Check saved invitations before another send. Restart and select the actual saved invitation instead of sending it again.')
  if (!page.fresh) return blocked('Wait for a successful member/invitation read. Failure is not an empty household.')
  if (!page.selection || !page.kind) return blocked('Choose a new invitation, an existing invitation, or an existing member on the page.')
  if (step > 0 && page.selection !== task?.selection) return blocked('A different recipient or record is selected. Start again to use it.')
  if (page.kind === 'new' && !page.canManage) return blocked('Your role cannot send invitations. Choose an existing member or read-only review.')
  if (step >= 3 && page.dirty) return blocked('Resolve the invitation form before continuing. Sending is a real email action; the guide never clicks it.')
  if (step >= 3 && page.kind === 'new' && !page.invitationId) return blocked('Send only when the recipient and role are right, or restart to keep an existing member/invitation without sending.')
  if (step >= 4 && task?.invitationId && page.invitationId !== task.invitationId) return blocked('The selected invitation changed or is unavailable. Start again to check its current state.')
  return { canNext: true, message: '' }
}
export function invitationStepOverride(step: number, page: InvitationTutorialPage | null) {
  if (!page || step === 0) return undefined
  if (page.kind === 'review') return { targetId: 'invite-tour-members', title: 'Review household membership',
    body: 'You can review visible members. Only an Owner or Admin can send invitations. No message is needed to finish this explanation, and another member’s private accounts remain private.' }
  if (page.kind === 'member') return { targetId: 'invite-tour-selected', title: 'This person is already a member',
    body: 'Check the displayed membership and role. No new invitation is needed. Joining allows the permitted household access—not another person’s private accounts, notes or import files.' }
  if (page.kind === 'invitation' || step >= 4 || page.invitationId) {
    if (page.status === 'Expired') return { targetId: 'invite-tour-selected', title: 'This invitation has expired',
      body: 'It cannot be accepted as it stands. Resend is a separate deliberate email action if still appropriate. You may finish this review without sending anything.' }
    if (page.status === 'Revoked') return { targetId: 'invite-tour-selected', title: 'This invitation was revoked',
      body: 'This invitation no longer grants access. Do not send another merely to complete a guide. You can finish this review unchanged.' }
    if (page.status === 'Accepted') return { targetId: 'invite-tour-selected', title: 'This invitation was accepted',
      body: 'Acceptance has already happened. Check Members for current access; do not create another invitation. The guide never accepts on someone else’s behalf.' }
    if (page.emailDelivered === false) return { targetId: 'invite-tour-selected', title: 'Saved—but email failed',
      body: 'The invitation is saved, but delivery failed. Resend is optional and must be clicked explicitly. Finishing this review does not mean an email reached the recipient.' }
    return { targetId: 'invite-tour-selected', title: 'Pending acceptance',
      body: 'The invitation is saved and pending. Pending does not prove email arrived. The recipient accepts separately; you do not need to wait here. Resend or Revoke are separate decisions.' }
  }
  return undefined
}
