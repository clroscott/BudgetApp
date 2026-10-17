import { createContext } from 'react'
import type { BudgetScope, BudgetStatus } from '../budgets/budgetApi'

export const budgetTutorialKey = 'build-first-budget'
export const budgetTutorialSteps = { choose: 0, start: 1, overall: 2, breakdown: 3, second: 4, third: 5, save: 6, meaning: 7, activate: 8, done: 9 } as const
// Read-only observations. No amounts, category names, or write callbacks cross this boundary.
export interface BudgetTutorialPage {
  householdId: string
  year: number
  month: number
  scope: BudgetScope
  budgetId: string | null
  status: BudgetStatus | null
  fresh: boolean
  canManage: boolean
  canPlan: boolean
  busy: boolean
  dirty: boolean
  hasSavedAmounts: boolean
  hasEnteredAmounts: boolean
  uncertain: boolean
  overallDetailed: boolean
  hasBreakdown: boolean
  breakdownDetailed: boolean
  hasSecondCategory: boolean
  hasThirdCategory: boolean
  copySource?: string
}
export interface BudgetTutorialTask {
  householdId: string
  role: string
  year: number
  month: number
  scope: BudgetScope
  budgetId?: string
  finishStatus?: BudgetStatus
}
export interface BudgetTutorialControls {
  canNext: boolean
  nextLabel: string
  message: string
  canBack: boolean
  canKeepDraft: boolean
  keepDraft: () => void
  restart: () => void
  returnToTask: () => void
  complete: (destination: 'budget' | 'tutorials') => void
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export const BudgetTutorialPageContext = createContext<((owner: symbol, page: BudgetTutorialPage | null) => void) | null>(null)

export function budgetTutorialRoute(task: BudgetTutorialTask | null) {
  return task ? `/budgeting?year=${task.year}&month=${task.month}&scope=${task.scope}` : '/budgeting'
}

export function budgetTutorialGate(step: number, task: BudgetTutorialTask | null, householdId: string | undefined,
  role: string | undefined, page: BudgetTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, nextLabel: 'Next', message, canKeepDraft: false })
  const ready = (nextLabel: string) => ({ canNext: true, nextLabel, message: '', canKeepDraft: false })
  if (!householdId || !page || page.householdId !== householdId) return blocked('Return to Monthly budget to continue.')
  if (step > 0 && (!task || task.householdId !== householdId || task.role !== role))
    return blocked('Household or permission changed. Restart and choose your month again.')
  if (page.busy) return blocked('Working… Please wait.')
  if (page.uncertain) return blocked('Check saved budget on the page before continuing. Do not repeat the action yet.')
  if (!page.fresh) return blocked('Load or refresh the budget first. A failed load does not mean no budget exists.')
  if (!page.canManage) return blocked('Your current role cannot edit this budget. You can exit without changing anything.')
  if (step > 0 && (task!.year !== page.year || task!.month !== page.month || task!.scope !== page.scope))
    return blocked('Different month or scope selected. Restart to use it, or return to your original selection.')
  if (step > 0 && task!.budgetId && task!.budgetId !== page.budgetId)
    return blocked('The selected budget changed or was removed. Restart to check its current state.')
  if (page.status === 'Closed') return blocked('This month is closed. Go Back or restart to choose an editable month; this guide will not reopen it.')
  if (!page.canPlan) return blocked('Add an active expense category before planning this month, then refresh the budget.')
  if (step === 0) return ready('Use this month')
  if (!page.budgetId) return blocked('') // Wait for the normal Create blank budget outcome.
  if (step === 1) return ready('Plan amounts')
  if (step === budgetTutorialSteps.overall) return page.hasEnteredAmounts || page.hasSavedAmounts ? ready('Totals and breakdowns') : blocked('Enter a planned amount. Zero is allowed; blank means no plan.')
  // These are optional planning choices, not write outcomes. Do not force a
  // user to switch modes or allocate money to an unnecessary category.
  if (step === budgetTutorialSteps.breakdown) return ready('Next category')
  if (step === budgetTutorialSteps.second) return ready('One more category')
  if (step === budgetTutorialSteps.third) return ready('Review and save')
  if (page.dirty) return blocked('Save your budget on the page before continuing.')
  if (!page.hasSavedAmounts) return blocked('Save at least one planned amount, including zero, before continuing.')
  if (step === budgetTutorialSteps.save) return ready('Draft or Active?')
  if (step === budgetTutorialSteps.meaning) return ready('Choose status')
  if (step === budgetTutorialSteps.activate) return page.status === 'Active' ? ready('Verify budget')
    : { ...blocked(''), nextLabel: 'Verify activation', canKeepDraft: page.status === 'Draft' }
  if (page.status !== task?.finishStatus) return blocked('The status changed. Go Back and review activation again.')
  return ready('Continue budgeting')
}

export function budgetTutorialStepOverride(step: number, page: BudgetTutorialPage | null) {
  if (!page) return undefined
  if (step === budgetTutorialSteps.overall && page.overallDetailed) return {
    targetId: 'budget-tutorial-overall-mode',
    body: 'This category already uses Detailed amounts. Overall would use one total instead. Keep your breakdown if it suits you; switching modes clears the other amounts after confirmation.',
  }
  if (step === budgetTutorialSteps.breakdown) {
    if (!page.hasBreakdown) return { targetId: 'budget-tutorial-planning',
      body: 'These categories have no subcategories yet, so use one total each. With subcategories, Detailed lets you split that total into smaller amounts. You can add subcategories later in Categories.' }
    return { targetId: page.breakdownDetailed ? 'budget-tutorial-breakdown-input' : 'budget-tutorial-breakdown-mode' }
  }
  if (step === budgetTutorialSteps.second && !page.hasSecondCategory || step === budgetTutorialSteps.third && !page.hasThirdCategory)
    return { targetId: 'budget-tutorial-summary', title: 'No more categories to plan',
      body: 'There are no other active categories to fill here. Continue with this plan; you can add categories later when you need them.' }
  return undefined
}
