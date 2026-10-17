import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { BudgetTutorialPage } from './budgetTutorialState'
import type { ReadTutorialControls } from './readTutorialState'

export const recurringTutorialKey = 'recurring-expenses'
export interface RecurringTutorialPage {
  householdId: string
  fresh: boolean
  busy: boolean
  dirty: boolean
  uncertain: boolean
  selection: string | null
  scope: 'Household' | 'Personal' | null
  editing: boolean
  saved: boolean
  expenseId?: string | null
}
export interface RecurringTutorialTask {
  householdId: string
  role: string
  selection: string
  expenseId?: string
  scope: 'Household' | 'Personal'
  budget?: { year: number; month: number; scope: 'Household' | 'Personal'; budgetId?: string }
  monthly?: boolean
}
export const RecurringTutorialPageContext = createContext<((owner: symbol, page: RecurringTutorialPage | null) => void) | null>(null)
export interface RecurringTutorialControls extends ReadTutorialControls {
  selection?: string
  expenseId?: string
  buildMonthly: () => void
  canBuildMonthly: boolean
  stepOverride?: { title?: string; body?: string; targetId?: string }
}
export function useRecurringTutorialPage(page: RecurringTutorialPage | null) {
  const publish = useContext(RecurringTutorialPageContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === recurringTutorialKey
  const [owner] = useState(() => Symbol('recurring tutorial page'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as RecurringTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
export function recurringTutorialRoute(step: number, task: RecurringTutorialTask | null) {
  if (step === 6 || step === 7 || step === 8 && task?.monthly) {
    const period = task?.budget
    return period ? `/budgeting?year=${period.year}&month=${period.month}&scope=${period.scope}`
      : `/budgeting?scope=${task?.scope ?? 'Household'}`
  }
  return '/budgeting/recurring-expenses'
}
export function recurringTutorialGate(step: number, householdId: string | undefined, role: string | undefined,
  task: RecurringTutorialTask | null, page: RecurringTutorialPage | null, budget: BudgetTutorialPage | null) {
  const blocked = (message: string) => ({ canNext: false, message })
  if (step > 0 && (!task || task.householdId !== householdId || task.role !== role))
    return blocked('Household or role changed. Start again to choose your task.')
  if (step >= 6 && task?.monthly) {
    if (!budget || budget.householdId !== householdId) return blocked('Return to Monthly budget to continue.')
    if (budget.busy || !budget.fresh) return blocked('Wait for a successful budget read.')
    if (budget.uncertain) return blocked('Check saved budget before trying again. Do not repeat the create action.')
    if (!budget.canManage) return blocked('Your role cannot build this monthly budget. Exit without changing it.')
    if (budget.scope !== task.scope) return blocked('Choose the same scope as your recurring expense, or restart the task.')
    if (task.budget && (budget.year !== task.budget.year || budget.month !== task.budget.month || budget.scope !== task.budget.scope
      || task.budget.budgetId && budget.budgetId !== task.budget.budgetId)) return blocked('Month, scope or budget changed. Return to your selection or start again.')
    if (budget.dirty) return blocked('Save or discard the budget edits on the page before continuing.')
    if (step >= 7 && !budget.budgetId) return blocked('Build from recurring expenses on the page, or go Back to choose another month. No budget will be replaced.')
    return { canNext: true, message: '' }
  }
  if (!page || page.householdId !== householdId) return blocked('Return to Recurring expenses to continue.')
  if (page.busy) return blocked('Working… Please wait.')
  if (page.uncertain) return blocked('Check the saved list first. If the result is unclear, restart and select the saved item instead of adding it again.')
  if (!page.fresh) return blocked('Load the recurring expenses successfully first. A failed read is not an empty list.')
  if (!page.selection || !page.scope) return blocked('Choose a new or existing recurring expense on the page.')
  if (step > 0 && page.selection !== task?.selection) return blocked('A different item is selected. Start again to use it.')
  if (step >= 5 && task?.expenseId && page.expenseId !== task.expenseId) return blocked('The saved item changed or is unavailable. Start again to check it.')
  if (step > 0 && task?.scope !== page.scope) return blocked('Scope changed. Start again to use this scope.')
  if (step >= 1 && step <= 3 && !page.editing) return blocked('Open Edit for the selected item, or fill the new-item form.')
  if (step >= 4 && (!page.saved || page.dirty || page.editing)) return blocked('Save on the page, or Cancel an unchanged existing item. The guide never saves for you.')
  return { canNext: true, message: '' }
}
