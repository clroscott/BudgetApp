import type { TutorialDefinition } from './tutorialDefinitions'
export const lifecycleTutorial: TutorialDefinition = {
  key: 'budget-lifecycle', version: 1, kind: 'GuidedFinancialTask', title: 'Copy, reopen or replace budgets', resumeBehavior: 'restart',
  description: 'Choose only the budget-state task you need. No required reset, deletion or replacement.', estimatedMinutes: 5,
  steps: [
    { title: 'Choose one task', targetId: 'budget-tutorial-period', body: 'Copy a plan to another month, reopen a Closed plan, or return an Active plan to Draft. Replacement is an optional separate step—not a required reset exercise.' },
    { title: 'Check month and scope', targetId: 'budget-tutorial-period', body: 'Choose the intended month and scope. Read its current saved status first. Copy needs a different source month; an existing destination is never silently overwritten.' },
    { title: 'Use only the chosen action', targetId: 'budget-tutorial-summary', body: 'Use the matching page control if needed, then wait for saved status. You can keep the plan unchanged. No tutorial button copies, reopens or changes status for you.' },
    { title: 'Review the saved plan', targetId: 'budget-tutorial-summary', body: 'Check amounts and current status. Copy makes an independent Draft; reopening allows edits. Closing never freezes historical transaction actuals. Saved changes stay after Exit.' },
    { title: 'Check replacement impact', targetId: 'annual-tour-allocation', body: 'Choose a saved annual plan in the same scope that contains the chosen month. Select only that Draft month for this focused task, review the impact, then explicitly enable Draft replacement. Active and Closed remain protected.' },
    { title: 'Confirm only if intended', targetId: 'annual-tour-allocate', body: 'Use Create selected drafts on the page and read its counts and replacement warning. Replacement changes the chosen Draft’s plan amounts, not transactions or annual targets. You can keep saved amounts unchanged instead.' },
    { title: 'Plan and status checked', targetId: 'budget-tutorial-summary', body: 'Your saved plan was checked. Continue budgeting stays here. Replaced amounts are not automatically recoverable.' },
  ].map((step, index) => ({ ...step, route: index === 4 || index === 5 ? '/budgeting/annual-targets' : '/budgeting', advance: 'outcome' as const })),
}
