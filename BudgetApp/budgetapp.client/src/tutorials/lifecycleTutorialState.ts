import type { BudgetScope } from '../budgets/budgetApi'
import type { BudgetTutorialPage } from './budgetTutorialState'
import type { AnnualTutorialPage } from './annualTutorialState'
import type { ReadTutorialControls } from './readTutorialState'
export type LifecycleMode = 'copy' | 'reopen' | 'return'
export interface LifecycleTask {
  householdId: string; role: string; mode: LifecycleMode
  year?: number; month?: number; scope?: BudgetScope; budgetId?: string; copySource?: string
  kept?: boolean; replaced?: boolean
  annual?: { year: number; startMonth: number; planId: string; baselineRevision: number }
}
export interface LifecycleControls extends ReadTutorialControls {
  choose: (mode: LifecycleMode) => void; canKeep: boolean; keepUnchanged: () => void
  canReplace: boolean; openReplacement: () => void
  annualSelection?: { year: number; startMonth: number; scope: BudgetScope }
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const lifecycleRoute = (step: number, task: LifecycleTask | null) => step === 4 || step === 5 ? '/budgeting/annual-targets'
  : task?.year && task.month && task.scope ? `/budgeting?year=${task.year}&month=${task.month}&scope=${task.scope}` : '/budgeting'
export function lifecycleGate(step: number, hh: string | undefined, role: string | undefined, task: LifecycleTask | null, budget: BudgetTutorialPage | null, annual: AnnualTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, canKeep: false, message })
  const ready = { canNext: true, canKeep: false, message: '' }
  if (!hh || !role) return blocked('Choose a household first.')
  if (step > 0 && (!task || task.householdId !== hh || task.role !== role)) return blocked('Household or role changed. Restart and choose the task again.')
  if (step === 4 || step === 5) {
    if (!annual || annual.householdId !== hh || !annual.fresh || annual.busy || annual.uncertain) return blocked('Load the annual plan and budget impact successfully. Check uncertain writes before another allocation.')
    if (!annual.canManage) return blocked('Your role cannot replace Draft amounts. Exit without changing them.')
    if (annual.dirty || !annual.planId) return blocked('Save the intended annual targets first, or leave replacement and keep the current monthly plan.')
    if (annual.scope !== task?.scope) return blocked('Choose the same scope as the original monthly Draft.')
    const period = `${task.year}-${task.month}`
    const target = annual.budgets.find(item => item.year === task.year && item.month === task.month && item.id === task.budgetId)
    if (!target || target.status !== 'Draft') return blocked('The chosen month must be a current Draft within this annual plan. Active and Closed budgets stay protected.')
    if (step === 5 && (annual.year !== task.annual?.year || annual.startMonth !== task.annual.startMonth || annual.planId !== task.annual.planId)) return blocked('The annual plan changed. Go Back and explicitly review this impact again.')
    if (step === 5 && task.replaced) return ready
    const confirmed = step === 5 && annual.allocationRevision > (task.annual?.baselineRevision ?? 0) && annual.allocationReplaces && annual.allocationReplacedCount === 1 && annual.allocationPeriods.length === 1 && annual.allocationPeriods[0] === period
    if (confirmed) return ready
    if (annual.selectedPeriods.length !== 1 || annual.selectedPeriods[0] !== period || !annual.replaceDrafts) return { ...blocked('For this focused replacement select only the original Draft month and explicitly enable replacement. Go Back to review changes.'), canKeep: step === 5 }
    return step === 4 ? ready : { ...blocked('Use the page allocation confirmation only if intended. Or keep the checked saved plan unchanged.'), canKeep: true }
  }
  if (!budget || budget.householdId !== hh || !budget.fresh || budget.busy || budget.uncertain) return blocked('Load the selected month successfully first. A failed read does not mean no budget exists.')
  if (!budget.canManage) return blocked('Your current role cannot change this budget. You can exit without changing it.')
  if (budget.dirty) return blocked('Save or cancel the intended monthly amounts before continuing.')
  if (step === 0) return ready
  if (step > 1 && (budget.year !== task?.year || budget.month !== task.month || budget.scope !== task.scope)) return blocked('Month or scope changed. Return to the selected month or restart.')
  if (step > 1 && task?.budgetId && budget.budgetId !== task.budgetId) return blocked('The chosen budget was replaced or removed. Restart to inspect the actual saved state.')
  if (step === 1) {
    if (task?.mode !== 'copy' && !budget.budgetId) return blocked('Choose an existing budget for this status task. Do not create a plan merely for practice.')
    if (task?.mode === 'return' && budget.status === 'Closed') return blocked('This month is Closed. Use the separate Reopen task rather than returning it directly to Draft.')
    if (task?.mode === 'copy' && !budget.budgetId && !budget.copySource) return blocked('Choose an existing source budget. An empty source list is not a reason to manufacture one.')
    return ready
  }
  if (step === 2) {
    if (task?.kept) return ready
    if (task?.mode === 'copy' && !budget.budgetId && task.copySource !== budget.copySource) return { ...blocked('The copy source changed. Go Back and confirm it first.'), canKeep: true }
    const waiting = task?.mode === 'copy' ? !budget.budgetId : task?.mode === 'reopen' ? budget.status === 'Closed' : budget.status !== 'Draft'
    return waiting ? { ...blocked('Use the intended page action and wait for saved state—or keep this month unchanged.'), canKeep: true } : ready
  }
  return ready
}
