import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { ReadTutorialControls } from './readTutorialState'
export const profileTutorialKey = 'manage-import-profiles'
export interface ProfileTutorialPage {
  page: 'profiles' | 'upload'
  householdId: string
  fresh: boolean
  busy: boolean
  dirty: boolean
  uncertain: boolean
  selection: string | null
  profileId: string | null
  editing: boolean
  canEdit: boolean
}
export interface ProfileTutorialTask { householdId: string; role: string; selection: string; profileId?: string }
export interface ProfileTutorialControls extends ReadTutorialControls {
  selection?: string
  profileId?: string
  startImport: () => void
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const ProfileTutorialPageContext = createContext<((owner: symbol, page: ProfileTutorialPage | null) => void) | null>(null)
export function useProfileTutorialPage(page: ProfileTutorialPage | null) {
  const publish = useContext(ProfileTutorialPageContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === profileTutorialKey
  const [owner] = useState(() => Symbol('profile tutorial page'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as ProfileTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
export function profileTutorialGate(step: number, householdId: string | undefined, role: string | undefined,
  task: ProfileTutorialTask | null, page: ProfileTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message })
  if (step > 0 && (!task || task.householdId !== householdId || task.role !== role)) return blocked('Household or role changed. Start again to choose your mapping.')
  if (!page || page.householdId !== householdId || page.page !== (step < 5 ? 'profiles' : 'upload')) return blocked('Return to the task page to continue.')
  if (page.busy) return blocked('Working… Please wait.')
  if (page.uncertain) return blocked('Check the saved profiles before another save. Restart and select the saved profile if the reply was lost.')
  if (!page.fresh) return blocked('Wait for a successful profile/account read. Failed reads are not empty profiles.')
  if (step >= 5) return task?.profileId && page.profileId === task.profileId ? { canNext: true, message: '' }
    : blocked('Choose the saved mapping in Import profile on the page. No file is needed to finish this guide.')
  if (!page.selection || !page.canEdit && page.selection === 'new') return blocked('Choose an existing active profile, or create one if your role permits it.')
  if (step > 0 && page.selection !== task?.selection) return blocked('A different profile is selected. Start again to use it.')
  if (step > 0 && step < 4 && page.canEdit && !page.editing) return blocked('Open the selected profile for editing, or go Back to choose another one.')
  if (step === 4 && (page.dirty || page.editing || !page.profileId)) return blocked('Save on the page, or Cancel an unchanged existing profile. The guide never saves for you.')
  return { canNext: true, message: '' }
}
