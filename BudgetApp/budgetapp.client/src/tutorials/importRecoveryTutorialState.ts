import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { ImportTutorialPage } from './importTutorialState'
import type { ReadTutorialControls } from './readTutorialState'
export const importRecoveryTutorialKey = 'fix-mistaken-import'
export type ImportRecoveryAction = 'correct' | 'discard' | 'undo' | 'inspect'
export interface ImportRecoveryTask { householdId: string; role: string; importId: string; url: string; action?: ImportRecoveryAction; kept?: boolean }
export interface RecoveryPreviewPage { householdId: string; importId: string; fresh: boolean; busy: boolean; uncertain: boolean; canReverse: boolean }
export interface ImportRecoveryControls extends ReadTutorialControls {
  choose: (action: ImportRecoveryAction) => void
  canCorrect: boolean; canDiscard: boolean; canUndo: boolean
  canKeep: boolean; keepUnchanged: () => void
  startNewImport: () => void
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const RecoveryPreviewContext = createContext<((owner: symbol, page: RecoveryPreviewPage | null) => void) | null>(null)
export function useRecoveryPreviewPage(page: RecoveryPreviewPage | null) {
  const publish = useContext(RecoveryPreviewContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === importRecoveryTutorialKey
  const [owner] = useState(() => Symbol('import undo preview'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as RecoveryPreviewPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
}
export function recoveryGate(step: number, hh: string | undefined, role: string | undefined, task: ImportRecoveryTask | null,
  page: ImportTutorialPage | null, preview: RecoveryPreviewPage | null) {
  const blocked = (message: string) => ({ canNext: false, canKeep: false, message })
  const ready = { canNext: true, canKeep: false, message: '' }
  if (!hh || !role) return blocked('Choose a household first.')
  if (step > 0 && (!task || task.householdId !== hh || task.role !== role)) return blocked('Household or role changed. Restart to choose this import again.')
  if (!page || page.page !== 'review' || page.householdId !== hh) return blocked('Return to Import review.')
  if (page.busy || preview?.busy) return blocked('Working… Please wait. Do not repeat the action.')
  const discarded = task?.action === 'discard' && page.discardedImportId === task.importId && page.listFresh
  if (discarded && step >= 3) return ready
  if (!page.fresh || page.uncertain || preview?.uncertain) return blocked('Check saved import status before another change. A failed or uncertain result is not success.')
  if (!page.importId) return blocked('Choose a visible import first. No example import is created.')
  if (step > 0 && page.importId !== task?.importId) return blocked('A different import is selected. Return to the selected import or restart.')
  if (step === 0 || step === 1) return page.dirty ? blocked('Save or reset existing staged changes before choosing a recovery task.') : ready
  if (step === 2 && task?.action === 'undo') return preview?.importId === task.importId && preview.householdId === hh && preview.fresh
    ? ready : blocked('Open Preview undo and load its current eligibility checks. Previewing changes nothing.')
  if (step === 2) return ready
  if (page.dirty) return blocked('Save or reset the staged row/rule changes before continuing.')
  if (task?.kept) return ready
  const keep = !task?.kept && (step === 2 || step === 3)
  if (step === 3 && task?.action === 'discard') return { ...blocked('Discard only if intended, using the page confirmation. Otherwise keep this file unchanged.'), canKeep: keep }
  if (step === 3 && task?.action === 'undo' && page.status !== 'Reversed') return {
    ...blocked(preview?.canReverse ? 'Undo only if intended, using the whole-batch page confirmation. Or keep it unchanged.' : 'Undo is blocked. Keep the batch unchanged; do not delete transactions or bypass blockers.'), canKeep: keep }
  if (step >= 3 && task?.action === 'correct' && !['ReadyForReview', 'Completed'].includes(page.status)) return blocked('The import status changed. Restart and inspect its current state.')
  return { ...ready, canKeep: keep }
}
