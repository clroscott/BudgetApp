import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { ReadTutorialControls } from './readTutorialState'

export const dashboardTutorialKey = 'customize-dashboard'
export interface DashboardTutorialPage {
  householdId: string
  fresh: boolean
  hasLayout: boolean
  editing: boolean
  dirty: boolean
  busy: boolean
  uncertain: boolean
}
export const DashboardTutorialPageContext = createContext<((owner: symbol, page: DashboardTutorialPage | null) => void) | null>(null)
export type DashboardTutorialControls = ReadTutorialControls

export function useDashboardTutorialPage(page: DashboardTutorialPage | null) {
  const publish = useContext(DashboardTutorialPageContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === dashboardTutorialKey
  const [owner] = useState(() => Symbol('dashboard tutorial page'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as DashboardTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}

export function dashboardTutorialGate(step: number, householdId: string | undefined, role: string | undefined,
  task: { householdId: string; role: string } | null, page: DashboardTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message })
  if (step > 0 && (!task || task.householdId !== householdId || task.role !== role))
    return blocked('Household or role changed. Start again to choose this layout.')
  if (!page || page.householdId !== householdId) return blocked('Return to Dashboard to continue.')
  if (page.busy) return blocked('Working… Please wait.')
  if (page.uncertain) return blocked('Check saved layout before trying another change. Do not repeat the save yet.')
  if (!page.fresh || !page.hasLayout) return blocked('Wait for a successful layout read. A failed read is not a default layout.')
  if (step <= 3 && !page.editing) return blocked('Open Customize dashboard on the page to inspect your layout.')
  if (step >= 4 && (page.editing || page.dirty)) return blocked('Save layout on the page, or Cancel to keep the saved layout.')
  return { canNext: true, message: '' }
}
