import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { useRouter } from '../routing/useRouter'
import { useHouseholds } from '../households/useHouseholds'
import { TutorialContext } from './tutorialContext'

// Read status/context only: never record amounts, record contents or API commands.
export interface ReadTutorialPage {
  householdId: string
  path: string
  url: string
  ready: boolean
  message?: string
}
export const ReadTutorialPageContext = createContext<((owner: symbol, page: ReadTutorialPage | null) => void) | null>(null)
export interface ReadTutorialControls {
  canNext: boolean
  message: string
  canBack: boolean
  returnToTask: () => void
  restart: () => void
}

export function useReadTutorialPage(ready: boolean, message?: string) {
  const publish = useContext(ReadTutorialPageContext)
  const { path, search } = useRouter()
  const { currentHousehold } = useHouseholds()
  const active = useContext(TutorialContext)?.activeTutorial?.presentation === 'read-companion'
  const [owner] = useState(() => Symbol('read tutorial page'))
  const householdId = currentHousehold?.id
  useLayoutEffect(() => {
    publish?.(owner, active && householdId ? { householdId, path, url: path + search, ready, message } : null)
  }, [publish, owner, active, householdId, path, search, ready, message])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}

export function readTutorialGate(householdId: string | undefined, role: string | undefined,
  task: { householdId: string; role: string } | null, page: ReadTutorialPage | null,
  path: string, expectedPath: string, navigationConfirmed = false) {
  if (task && (task.householdId !== householdId || task.role !== role))
    return { canNext: false, message: 'Household or role changed. Start again to use this context.' }
  if (navigationConfirmed && task) return { canNext: true, message: '' }
  if (path !== expectedPath || !page || page.path !== path || page.householdId !== householdId)
    return { canNext: false, message: 'Return to the tutorial page to continue.' }
  return page.ready ? { canNext: true, message: '' }
    : { canNext: false, message: page.message ?? 'Wait for a successful load. A failed read is not an empty result.' }
}
