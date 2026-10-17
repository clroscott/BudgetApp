import type { ImportTutorialPage } from './importTutorialState'
import type { ReadTutorialControls } from './readTutorialState'
export const importProblemsTutorialKey = 'resolve-import-problems'
export interface ImportProblemsTask {
  householdId: string; role: string; mode: 'upload' | 'staged' | 'inspect'; accountId?: string; fileRevision?: number; importId?: string; url?: string
}
export interface ImportProblemsControls extends ReadTutorialControls {
  choose: (mode: ImportProblemsTask['mode']) => void
  inspectSavedImports: () => void
  canInspectSaved: boolean
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export function problemsRoute(step: number, task: ImportProblemsTask | null) {
  return step < 4 || task?.mode === 'inspect' ? '/import' : task?.url ?? `/imports/review${task?.importId ? `?importId=${encodeURIComponent(task.importId)}` : ''}`
}
export function problemsGate(step: number, hh: string | undefined, role: string | undefined, task: ImportProblemsTask | null, page: ImportTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message })
  const ready = { canNext: true, message: '' }
  if (!hh || !role || !page || page.householdId !== hh) return blocked('Return to the task page with a chosen household.')
  if (step > 0 && (!task || task.householdId !== hh || task.role !== role)) return blocked('Household or permission changed. Restart and choose this problem again.')
  if (page.busy) return blocked('Working… Please wait.')
  if (step === 0 || task?.mode === 'inspect') return page.page === 'upload' && page.loaded ? ready : blocked('Read accounts and profiles successfully first. No file is needed for the guidance-only finish.')
  if (step < 4) {
    if (page.page !== 'upload' || !page.loaded) return blocked('Return to the selected upload and load account/profile choices.')
    if (page.uncertain) return blocked('Do not repeat this write. Inspect the saved imports or profiles first; no result is assumed from local form values.')
    if (!page.canImport) return blocked('Choose a permitted active account. Viewers may import into their own Personal accounts.')
    if (!page.fileType || page.fileType === 'unsupported') return blocked('Choose a supported CSV or .xlsx file, without manufacturing a broken example.')
    if (step > 1 && (page.accountId !== task?.accountId || page.fileRevision !== task.fileRevision)) return blocked('The file or account changed. Restart to confirm this context; nothing is retried automatically.')
    if (step === 3 && !page.stagedId) return blocked('Use the normal upload controls and wait for confirmed staging. Exit is always available if the problem is unresolved.')
    return ready
  }
  if (page.page !== 'review' || !page.fresh || page.uncertain) return blocked('Load the saved import successfully first. A failed read is not an empty or resolved import.')
  if (task?.importId && page.importId !== task.importId) return blocked('A different import is selected. Return to the selected file or restart.')
  if (page.dirty) return blocked('Save or reset intended row/rule corrections before continuing.')
  if (page.status !== 'ReadyForReview') return blocked('Choose an unfinished import. Completed batches use the separate mistaken-import recovery guide.')
  if (step >= 5 && (page.invalidRows ?? 0) > 0) return blocked('Invalid rows still need attention. Correct and save the intended values, or Exit and continue fixing on the page. The guide will not invent a resolution.')
  return ready
}
