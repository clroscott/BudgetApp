import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { ReadTutorialControls } from './readTutorialState'
import type { TransactionTutorialPage } from './transactionTutorialState'
import type { ImportTutorialPage } from './importTutorialState'
export const categorizationTutorialKey = 'categorize-transactions'
export interface RuleTutorialPage {
  householdId: string; fresh: boolean; busy: boolean; dirty: boolean; uncertain: boolean
  selection: string | null; ruleId: string | null; canManage: boolean; editing: boolean
}
export interface CategorizationTask {
  householdId: string; role: string; mode: 'posted' | 'staged'; selection?: string; url?: string; ruleId?: string; ruleSelection?: string; optionalRules?: boolean; baselineRevision?: number; checkedOutcome?: boolean
}
export interface CategorizationControls extends ReadTutorialControls {
  choose: (mode: 'posted' | 'staged') => void
  openRules: () => void
  ruleId?: string
  ruleSelection?: string
  selection?: string
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const RuleTutorialPageContext = createContext<((owner: symbol, page: RuleTutorialPage | null) => void) | null>(null)
export function useRuleTutorialPage(page: RuleTutorialPage | null) {
  const publish = useContext(RuleTutorialPageContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === categorizationTutorialKey
  const [owner] = useState(() => Symbol('category tutorial rules'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as RuleTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
export function categoryTutorialRoute(step: number, task: CategorizationTask | null) {
  if (step === 5 || step === 6) return '/settings/categorization-rules'
  return task?.url ?? (task?.mode === 'staged' ? '/imports/review' : '/transactions')
}
export function categorizationGate(step: number, hh: string | undefined, role: string | undefined, task: CategorizationTask | null,
  transaction: TransactionTutorialPage | null, imported: ImportTutorialPage | null, rules: RuleTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message })
  const ready = { canNext: true, message: '' }
  if (!hh || !role) return blocked('Choose a household first.')
  if (step === 0) return ready
  if (!task || task.householdId !== hh || task.role !== role) return blocked('Household or role changed. Restart to choose this task again.')
  if (step === 5 || step === 6) {
    if (!rules || rules.householdId !== hh) return blocked('Return to Categorization rules.')
    if (!rules.fresh || rules.busy || rules.uncertain) return blocked('Read the saved rules successfully before continuing. Check uncertain saves; do not create another copy.')
    if (step === 5) return rules.ruleId || rules.selection === 'new' && rules.canManage ? ready : blocked('Choose an existing active rule or New rule.')
    if (rules.selection !== task.ruleSelection) return blocked('A different rule is selected. Go Back to choose it explicitly.')
    if (rules.dirty || !rules.ruleId || rules.editing) return blocked('Save or Cancel the rule using page controls. Keep a correct existing rule unchanged.')
    if (task.ruleId && task.ruleId !== rules.ruleId) return blocked('A different rule is selected. Go Back to choose it explicitly.')
    return ready
  }
  if (task.mode === 'posted') {
    if (!transaction || transaction.householdId !== hh) return blocked('Return to Transactions.')
    if (!transaction.fresh || transaction.busy || transaction.uncertain || transaction.pendingFilters) return blocked('Apply filters and check current saved results. Resolve failed or uncertain requests first.')
    if (step === 1) return !transaction.dirty && transaction.visible && transaction.selection && transaction.selection !== 'review' ? ready : blocked('Choose a visible transaction. Resolve existing unsaved changes first.')
    if (transaction.selection !== task.selection || transaction.url !== task.url) return blocked('The selected record or search changed. Return to your selected search, or restart.')
    if (step !== 2 && (transaction.dirty || transaction.editingId)) return blocked('Save or Cancel the row and any separate budget choices before continuing.')
    if (!transaction.visible && !task.checkedOutcome && transaction.outcomeRevision <= (task.baselineRevision ?? 0)) return blocked('Find the chosen transaction again; absence is not evidence of a save.')
    return ready
  }
  if (!imported || imported.page !== 'review' || imported.householdId !== hh || !imported.fresh || imported.busy) return blocked('Load the chosen import successfully first. A failed read is not an empty import.')
  if (step !== 1 && imported.importId !== task.selection) return blocked('Different import selected. Return to your selected import or restart.')
  if (imported.status !== 'ReadyForReview') return blocked('Choose an unfinished import. Completed transactions are corrected on Transactions.')
  if (step !== 2 && imported.dirty) return blocked('Save or reset staged corrections and rule edits before continuing.')
  if (step === 7 && task.optionalRules && !imported.rulesFresh) return blocked('Read the current rule effects successfully before applying anything.')
  return ready
}
