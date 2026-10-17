import type { TutorialDefinition } from './tutorialDefinitions'
export const annualBudgetTutorial: TutorialDefinition = {
  key: 'budget-from-annual-targets', version: 1, kind: 'GuidedFinancialTask', title: 'Budget from annual targets', resumeBehavior: 'restart',
  description: 'Save annual targets, deliberately allocate chosen months, then inspect one monthly plan.', estimatedMinutes: 6,
  steps: [
    { title: 'Choose the annual plan', targetId: 'annual-tour-selection', body: 'Check fiscal starting year, start month and scope. Annual targets and monthly budgets are separate saved plans. A failed load does not mean either is missing.' },
    { title: 'Overall or Detailed targets', targetId: 'annual-tour-targets', body: 'Overall uses one category total; Detailed uses its subcategories. Switching clears values in the other mode after confirmation. Blank means no target; zero is an explicit zero—not actual spending.' },
    { title: 'Save intended targets', targetId: 'annual-tour-save', body: 'Use Save annual targets if you changed them. A correct existing saved plan needs no example edit. Saving targets does not alter existing monthly budgets or ledger transactions.' },
    { title: 'Choose individual months', targetId: 'annual-tour-allocation', body: 'Select only the fiscal months you intend. Check each impact: create missing Draft, keep existing Draft, or protect Active/Closed. Keep Draft replacement off for this task; it has a separate guide.' },
    { title: 'Create only if needed', targetId: 'annual-tour-allocate', body: 'Choose Create selected drafts on the page and read its counts. You can instead keep existing monthly budgets and continue. Never allocate again just because a read failed.' },
    { title: 'Open one saved month', targetId: 'annual-tour-months', body: 'Open the actual link for one selected saved month. Missing months need deliberate creation first; existing Draft, Active or Closed months can be inspected without duplication.' },
    { title: 'Review the monthly plan', targetId: 'budget-tutorial-summary', body: 'Check month, scope, currency, planned amounts and status. Annual targets were copied once; changes here do not update annual targets. Actuals still come from included transactions.' },
    { title: 'Save—or keep the saved plan', targetId: 'budget-tutorial-save', fallbackTargetIds: ['budget-tutorial-summary'], body: 'Save intended monthly adjustments with the page button. Draft keeps planning; Active marks it ready to use. Activation is optional and never creates transactions. A Closed month can stay read-only.' },
    { title: 'Plans checked', targetId: 'budget-tutorial-summary', body: 'Plans stay independent. Continue budgeting stays here; nothing else is created or activated.' },
  ].map((step, index) => ({ ...step, route: index < 6 ? '/budgeting/annual-targets' : '/budgeting', advance: 'outcome' as const })),
}
