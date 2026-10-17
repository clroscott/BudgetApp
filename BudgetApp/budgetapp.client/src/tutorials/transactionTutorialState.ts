import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { ReadTutorialControls } from './readTutorialState'
export const transactionTutorialKey = 'search-edit-transactions'
export interface TransactionTutorialPage {
  householdId: string
  url: string
  fresh: boolean
  busy: boolean
  dirty: boolean
  uncertain: boolean
  pendingFilters: boolean
  selection: string | null
  visible: boolean
  canEdit: boolean
  editingId: string | null
  outcomeRevision: number
  outcomeKind: 'saved' | 'reloaded' | null
  attentionTarget?: string
}
export interface TransactionTutorialTask {
  householdId: string
  role: string
  url: string
  selection?: string
  baselineRevision?: number
  finish?: 'kept' | 'readonly' | 'review'
}
export interface TransactionTutorialControls extends ReadTutorialControls {
  selection?: string
  canKeepUnchanged: boolean
  keepUnchanged: () => void
  reviewAnother: () => void
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const TransactionTutorialPageContext = createContext<((owner: symbol, page: TransactionTutorialPage | null) => void) | null>(null)
export function useTransactionTutorialPage(page: TransactionTutorialPage | null) {
  const publish = useContext(TransactionTutorialPageContext)
  const active = [transactionTutorialKey, 'categorize-transactions'].includes(useContext(TutorialContext)?.activeTutorial?.key ?? '')
  const [owner] = useState(() => Symbol('transaction tutorial page'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as TransactionTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
export function transactionTutorialGate(step: number, householdId: string | undefined, role: string | undefined,
  task: TransactionTutorialTask | null, page: TransactionTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message, canKeepUnchanged: false })
  if (step > 0 && (!task || task.householdId !== householdId || task.role !== role)) return blocked('Household or role changed. Start again to choose this search.')
  if (!page || page.householdId !== householdId) return blocked('Return to Transactions to continue.')
  if (page.busy) return blocked('Working… Please wait.')
  if (page.uncertain) return blocked('Check saved state on the page before another save. Do not repeat an uncertain correction.')
  if (!page.fresh) return blocked('Load the search, account/category choices and totals successfully first. Failure is not zero results.')
  if (page.pendingFilters) return blocked('Apply your filter changes before continuing.')
  const ready = { canNext: true, message: '', canKeepUnchanged: false }
  if (step <= 1) return page.dirty ? blocked('Finish or cancel your existing unsaved edits before starting this search review.') : ready
  if (step === 2) {
    if (page.dirty) return blocked('Resolve the existing unsaved changes before choosing another record.')
    return page.selection === 'review' || page.selection && page.visible ? ready : blocked('Choose a visible transaction or Review results without editing.')
  }
  if (page.selection !== task?.selection) return blocked('A different record is selected. Go Back to choose it explicitly.')
  if (step >= 3 && step <= 6 && page.editingId && page.editingId !== page.selection) return blocked('A different row editor is open. Save or cancel that row before returning to the selected record.')
  const newOutcome = page.outcomeRevision > (task?.baselineRevision ?? 0) ? page.outcomeKind : null
  if (step < 6 && page.url !== task?.url) return blocked('This search changed. Return to the selected search, or start again with another record.')
  if (step < 6 && !page.visible && !newOutcome) return blocked('The chosen transaction is not shown. Return to the selected search or go Back to choose another.')
  if (step >= 3 && step <= 5 && newOutcome && !page.dirty && page.editingId === null) return ready
  if (step === 3) return { ...ready, canNext: !page.canEdit || page.editingId === page.selection,
    canKeepUnchanged: !page.dirty,
    message: page.canEdit && page.editingId !== page.selection ? 'Open Edit on this record, or choose Keep unchanged.' : '' }
  if (step === 4) return { ...ready, canKeepUnchanged: !page.dirty }
  if (step === 5 && (page.dirty || page.editingId !== null)) return blocked('Save or Cancel the current row on the page. Budget inclusion has its own separate Save.')
  if (step >= 6 && page.dirty) return blocked('Save or cancel all open changes before finishing this review.')
  if (step === 6 && task?.selection !== 'review' && !page.visible && !newOutcome) return blocked('The selected record is not shown. Find it again before continuing; absence is not a successful save.')
  if (step === 7 && page.url !== task?.url) return blocked('Return to the selected search to finish, or start again.')
  return ready
}
export function transactionStepOverride(step: number, task: TransactionTutorialTask | null, page: TransactionTutorialPage | null) {
  if (!page) return undefined
  if (page.uncertain && page.attentionTarget) return { targetId: page.attentionTarget, title: 'Check the saved result',
    body: 'Open the highlighted recovery controls and read the saved state before another save. Your unsaved choices are not proof of what reached the server.' }
  if (step >= 3 && step <= 5 && !page.busy && page.fresh && !page.dirty && page.editingId === null && page.outcomeRevision > (task?.baselineRevision ?? 0))
    return { targetId: 'transaction-task-outcome', title: 'Check the saved result',
      body: 'The page action finished and saved results were read. Continue to inspect what is currently saved; do not repeat the correction.' }
  if (step === 3 && !page.canEdit) return { targetId: 'transaction-task-record', title: 'Read-only transaction',
    body: 'You can inspect this permitted view, but cannot edit this transaction. Private account details and notes stay hidden. Continue without making a correction.' }
  if (step === 6) {
    const outcome = page.outcomeRevision > (task?.baselineRevision ?? 0) ? page.outcomeKind : null
    if (outcome === 'saved') return { targetId: 'transaction-task-outcome', title: page.visible ? 'Check the saved values' : 'Saved—no longer in this search',
      body: page.visible ? 'The save was confirmed and the list refreshed. Check the current values and totals. Next returns to your original filtered results.'
        : 'The save was confirmed, but this record no longer matches these filters. Broaden the search to inspect it, or Next to return to the original results. Do not save again.' }
    if (outcome === 'reloaded') return { targetId: 'transaction-task-outcome', title: 'Saved state reloaded',
      body: 'The result was uncertain, so saved results were reloaded. Check the actual values before another correction. A reload is not proof that the original request succeeded.' }
    return { targetId: page.visible ? 'transaction-task-record' : 'transaction-tour-count', title: 'Keep the correct record',
      body: 'No correction is required just to finish. Keep correct saved values unchanged. Next returns to your selected filtered results without saving anything.' }
  }
  if (step === 7 && task?.finish === 'review') return { targetId: 'transaction-tour-count', title: 'Search reviewed without editing',
    body: 'Results checked without editing. Continue stays here; no example transactions were created.' }
  return undefined
}
