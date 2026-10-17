import type { TutorialDefinition } from './tutorialDefinitions'

const report = '/budgeting/annual-overview'
export const annualOverviewTutorial: TutorialDefinition = {
  key: 'annual-overview', version: 1, kind: 'LearnOnly', presentation: 'read-companion',
  resumeBehavior: 'restart', title: 'Read the Annual Overview', estimatedMinutes: 4,
  description: 'Choose a year, understand the totals, then inspect the transactions behind spending.',
  continueLabel: 'Continue reviewing',
  steps: [
    { title: 'Choose your view', route: report, targetId: 'annual-tour-selection', advance: 'next',
      readControls: ['annual-tour-year', 'annual-tour-scope'],
      body: 'Choose a year and Household or Personal. This reads saved results; it does not change your budgets. Personal and Household can overlap—don’t add them together.',
      details: 'This report is not Annual Targets. Annual Targets plan future amounts; Annual Overview compares saved monthly budgets with included official transactions. Each view uses its displayed currency without automatic conversion.' },
    { title: 'Read the totals', route: report, targetId: 'annual-tour-totals', advance: 'next',
      body: 'Budgeted is your saved plan. Actual is included spending. Remaining is budgeted minus spending. Income and net cash flow describe money moving—not your bank balance.',
      details: 'Check the currency. Transactions in other currencies are excluded, with a warning. Uncategorized spending is included in spending totals but not a category row. A failed or stale read cannot establish that there is no spending.' },
    { title: 'One month at a time', route: report, targetId: 'annual-tour-month', fallbackTargetIds: ['annual-tour-months'], advance: 'next',
      body: 'A missing budget means no saved plan for that month. A saved $0 plan is different. Actual spending can still exist without a budget.',
      details: 'Draft and Active monthly budgets both contribute their saved amounts. Each month has its own budget and transaction links. Reading this report never creates a missing budget.' },
    { title: 'Compare categories', route: report, targetId: 'annual-tour-categories', advance: 'next',
      body: 'Compare category plans with recorded spending. Subcategories explain the breakdown. Check any uncategorized or currency warnings before assuming two totals should match.',
      details: 'Average actual uses the elapsed-month count shown by the report, not always twelve. Blank/missing plans are not zero. Shared expenses can contribute in both budget scopes while account details remain private.' },
    { title: 'See what makes up spending', route: report, targetId: 'annual-tour-transactions', advance: 'click',
      readControls: ['annual-tour-transactions'],
      body: 'Open the highlighted spending total. Its transaction view keeps this year, scope, currency and household, so you can inspect the contributing records.',
      details: 'This link reads transactions only. Do not change a record just to complete this guide. An empty transaction result is valid; no sample records are created.' },
    { title: 'Check the matching filters', route: '/transactions', targetId: 'transaction-tour-active', advance: 'next',
      body: 'These are the active report filters. They explain which records contribute. The tutorial does not edit transactions or change their budget inclusion.',
      details: 'The normal report return link preserves the selected report context. Next returns to the same Annual Overview without creating or modifying financial data.' },
    { title: 'Your report, explained', route: report, targetId: 'annual-tour-context', advance: 'next',
      body: 'You’ve checked the plan, actual spending and matching records. Continue reviewing stays on this report. Return to tutorials opens the tutorial list.',
      details: 'Replay uses a fresh read and a new explicit year/scope choice. Finishing records tutorial progress only; it does not certify that every financial record is correct.' },
  ].map(step => ({ ...step, advance: step.advance as 'next' | 'click', readControls: [...step.readControls ?? [], 'read-tour-reload'] })),
}
