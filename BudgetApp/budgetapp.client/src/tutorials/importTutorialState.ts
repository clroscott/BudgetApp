import { createContext } from 'react'

// Read-only page observations. Never pass files, row values, credentials or API
// commands through the tutorial bridge. Existing pages remain the write owners.
export type ImportTutorialPage = {
  page: 'upload'
  householdId: string
  accountId: string
  canImport: boolean
  loaded: boolean
  fileType: 'csv' | 'xlsx' | 'unsupported' | null
  busy: boolean
  stagedId: string | null
  fileRevision?: number
  uncertain?: boolean
  uncertainKind?: 'profile' | 'upload' | null
} | {
  page: 'review'
  householdId: string
  importId: string
  url?: string
  rulesFresh?: boolean
  listFresh?: boolean
  uncertain?: boolean
  discardedImportId?: string | null
  fresh: boolean
  canEdit: boolean
  status: string
  busy: boolean
  dirty: boolean
  pendingRows: number
  approvedRows: number
  totalRows: number
  invalidRows?: number
  duplicateRows?: number
}

export interface ImportTutorialTask { householdId: string; accountId?: string; importId?: string }
export interface ImportTutorialControls {
  canNext: boolean
  message: string
  nextLabel: string
  choose: (path: 'upload' | 'existing') => void
  restart: () => void
  returnToTask: () => void
  canBack: boolean
}

export const ImportTutorialPageContext = createContext<((owner: symbol, page: ImportTutorialPage | null) => void) | null>(null)
export const importTutorialKey = 'import-review'

export function importTutorialRoute(step: number, task: ImportTutorialTask | null) {
  return step < 4 ? '/import' : `/imports/review${task?.importId ? `?importId=${encodeURIComponent(task.importId)}` : ''}`
}

export function importTutorialGate(step: number, task: ImportTutorialTask | null, householdId: string | undefined,
  page: ImportTutorialPage | null): { canNext: boolean; message: string; nextLabel: string } {
  const blocked = (message: string) => ({ canNext: false, message, nextLabel: 'Next' })
  const ready = (nextLabel = 'Next', message = '') => ({ canNext: true, message, nextLabel })
  if (!householdId || !task || task.householdId !== householdId)
    return blocked('Household changed. Restart to continue; saved work is safe.')
  if (step === 0) return ready()
  if (!page || page.householdId !== householdId) return blocked('Return to the task page to continue.')
  if (page.busy) return blocked('Working… Please wait.')
  if (step < 4) {
    if (page.page !== 'upload') return blocked('Return to the upload page to continue.')
    if (!page.loaded) return blocked('Accounts couldn’t load. Use Retry loading on the page.')
    if (!page.canImport) return blocked('Choose an active account you may import into. Viewers can use their own Personal accounts.')
    if (step === 1) return ready('Use this account')
    if (page.accountId !== task.accountId) return blocked('Account changed. Go Back and confirm it first.')
    if (!page.fileType || page.fileType === 'unsupported') return blocked('')
    if (step === 2) return ready('Review file settings')
    return page.stagedId ? ready('Review staged import', 'Uploaded. Your rows are drafts, not official transactions.')
      : blocked('')
  }
  if (page.page !== 'review' || !page.fresh) return blocked('Load or refresh the selected import to continue.')
  if (task.importId && page.importId !== task.importId) return blocked('Different file selected. Return to your import or restart.')
  if (page.dirty) return blocked('Save your corrections on the page before continuing.')
  if (page.status === 'Completed') return ready(step === 9 ? 'Finish' : 'Verify completed import', step === 9 ? '' : 'Already completed—nothing will be created again.')
  if (page.status !== 'ReadyForReview') return blocked('This import isn’t ready for review. Check its status or choose another.')
  if (!page.canEdit) return blocked('You can’t review this account’s import. Restart and choose a permitted account.')
  if (step === 4) return ready('Use this import')
  if (step === 5) return ready('Review budget inclusion')
  if (step === 6) return ready('Review decisions')
  if (step === 7) return page.pendingRows === 0 ? ready('Review final creation') : blocked('')
  return blocked('')
}
