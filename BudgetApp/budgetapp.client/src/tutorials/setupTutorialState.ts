import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { ReadTutorialControls } from './readTutorialState'
export const setupTutorialKey = 'set-up-finances'
export type SetupSection = 'accounts' | 'categories' | 'both'
export interface SetupTutorialPage {
  page: 'accounts' | 'categories'
  householdId: string
  fresh: boolean
  busy: boolean
  dirty: boolean
  uncertain: boolean
  selection: string | null
  accountId: string | null
}
export interface SetupTutorialTask { householdId: string; role: string; section: SetupSection; selection?: string; accountId?: string }
export interface SetupTutorialControls extends ReadTutorialControls {
  choose: (section: SetupSection) => void
  selection?: string
  accountId?: string
  continueLabel: string
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const SetupTutorialPageContext = createContext<((owner: symbol, page: SetupTutorialPage | null) => void) | null>(null)
export function useSetupTutorialPage(page: SetupTutorialPage | null) {
  const publish = useContext(SetupTutorialPageContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === setupTutorialKey
  const [owner] = useState(() => Symbol('setup tutorial page'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as SetupTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
export function setupTutorialRoute(step: number, task: SetupTutorialTask | null) {
  return step === 4 || step === 5 || step === 6 && task?.section !== 'accounts' ? '/settings/categories' : '/accounts'
}
export function setupTutorialGate(step: number, householdId: string | undefined, role: string | undefined,
  task: SetupTutorialTask | null, page: SetupTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message })
  if (step > 0 && (!task || task.householdId !== householdId || task.role !== role)) return blocked('Household or role changed. Start again to choose your setup.')
  if (!page || page.householdId !== householdId || (step < 4 || step === 6 && task?.section === 'accounts') !== (page.page === 'accounts')) return blocked('Return to your selected setup page to continue.')
  if (page.busy) return blocked('Working… Please wait.')
  if (page.uncertain) return blocked('Check the saved list before making another change. Do not repeat a create while its result is uncertain.')
  if (!page.fresh) return blocked('Wait for a successful setup read. A failed read is not an empty account/category list.')
  if (step === 0 && page.dirty) return blocked('Resolve the existing unsaved form before choosing another setup section.')
  if (step >= 1 && step <= 3) {
    if (!page.selection) return blocked('Choose an existing account or New account on the page.')
    if (step > 1 && task?.selection !== page.selection) return blocked('A different account is selected. Go Back to choose it, or start again.')
    if (step === 3 && (page.dirty || !page.accountId)) return blocked('Save the account on the page, or keep an existing account unchanged. The guide never adds it for you.')
  }
  if (step >= 4 && page.dirty) return blocked('Save or cancel your open form on the page before continuing.')
  if (step === 6 && task?.section === 'accounts' && task.accountId !== page.accountId) return blocked('The chosen account changed or is unavailable. Restart to check it.')
  return { canNext: true, message: '' }
}
