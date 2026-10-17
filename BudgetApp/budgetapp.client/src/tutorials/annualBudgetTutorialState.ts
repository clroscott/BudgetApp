import type { AnnualTutorialPage } from './annualTutorialState'
import type { BudgetTutorialPage } from './budgetTutorialState'
import type { BudgetScope, BudgetStatus } from '../budgets/budgetApi'
import type { ReadTutorialControls } from './readTutorialState'
export interface AnnualBudgetTask {
  householdId: string; role: string; year: number; startMonth: number; scope: BudgetScope; planId?: string
  monthly?: { year: number; month: number; budgetId: string }
  annualOnly?: boolean; finishStatus?: BudgetStatus
}
export interface AnnualBudgetControls extends ReadTutorialControls {
  canFinishAnnual: boolean; finishAnnual: () => void
  openMonthly: (year: number, month: number) => boolean
  continueLabel: string
  selection?: { year: number; startMonth: number; scope: BudgetScope }
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export function annualBudgetRoute(step: number, task: AnnualBudgetTask | null) {
  return step < 6 || task?.annualOnly ? '/budgeting/annual-targets' : task?.monthly
    ? `/budgeting?year=${task.monthly.year}&month=${task.monthly.month}&scope=${task.scope}` : '/budgeting'
}
export function annualBudgetGate(step: number, hh: string | undefined, role: string | undefined, task: AnnualBudgetTask | null, annual: AnnualTutorialPage | null, budget: BudgetTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, canFinishAnnual: false, message })
  const ready = { canNext: true, canFinishAnnual: false, message: '' }
  if (!hh || !role) return blocked('Choose a household first.')
  if (step > 0 && (!task || task.householdId !== hh || task.role !== role)) return blocked('Household or role changed. Restart and choose the plan again.')
  if (step < 6 || task?.annualOnly) {
    if (!annual || annual.householdId !== hh || !annual.fresh || annual.busy || annual.uncertain) return blocked('Load saved targets and monthly-budget impact successfully. Check uncertain writes before another save/allocation.')
    if (!annual.canManage) return blocked('Your role cannot change this plan. You may inspect the page or Exit without changing it.')
    if (step > 0 && (task?.year !== annual.year || task.startMonth !== annual.startMonth || task.scope !== annual.scope)) return blocked('Fiscal period or scope changed. Go Back to choose it, or restart; no automatic allocation follows.')
    if (step > 0 && task?.planId && task.planId !== annual.planId) return blocked('The saved annual plan changed. Restart to inspect its current identity.')
    if (!annual.hasCategories) return blocked('No active expense categories are available. Add only configuration you actually need, then refresh; no example plan is forced.')
    if (step === 0) return annual.dirty ? blocked('Save or discard your existing annual edits before choosing this task.') : ready
    if (step === 1) return ready
    if (annual.dirty || !annual.planId) return blocked('Save intended annual targets first. Correct saved targets need no edit; zero is valid and blank means no target.')
    const optional = { ...ready, canFinishAnnual: step >= 3 && step <= 5 }
    if (task?.annualOnly) return ready
    if (annual.replaceDrafts) return { ...blocked('Keep existing Draft budgets for this guide. Turn off replacement, or use the separate Return/replace tutorial.'), canFinishAnnual: true }
    if (!annual.selectedPeriods.length) return { ...blocked('Select the individual months you intend, or finish with annual targets only.'), canFinishAnnual: true }
    if (step === 3) return optional
    const available = annual.budgets.some(item => annual.selectedPeriods.includes(`${item.year}-${item.month}`))
    if (step === 4) return available ? optional : { ...blocked('No selected saved month is available yet. Create only intended missing Drafts using the page confirmation, or finish annual targets only.'), canFinishAnnual: true }
    if (step === 5) return { ...blocked('Open one actual selected saved month from the highlighted list. This does not create or activate it.'), canFinishAnnual: true }
    return optional
  }
  if (!budget || budget.householdId !== hh || !budget.fresh || budget.busy || budget.uncertain) return blocked('Load the chosen monthly budget successfully and check uncertain writes first.')
  if (!budget.canManage) return blocked('Your current role cannot change this budget. Exit without changing it.')
  if (budget.year !== task?.monthly?.year || budget.month !== task.monthly.month || budget.scope !== task.scope || budget.budgetId !== task.monthly.budgetId) return blocked('A different monthly budget is selected. Return to the chosen month or restart.')
  if (step >= 7 && budget.dirty) return blocked('Save the intended monthly adjustments before continuing. Activation is optional.')
  if (step === 8 && budget.status !== task.finishStatus) return blocked('The monthly status changed. Go Back to check its current state.')
  return ready
}
