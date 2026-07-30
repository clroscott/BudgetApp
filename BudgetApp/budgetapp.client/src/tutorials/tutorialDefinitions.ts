export type TutorialAdvance = 'next' | 'click'
export type TutorialKind = 'LearnOnly' | 'GuidedSetup' | 'GuidedFinancialTask'

export interface TutorialStep {
  title: string
  body: string
  route: string
  targetId: string
  advance: TutorialAdvance
}

export interface TutorialDefinition {
  key: string
  version: number
  kind: TutorialKind
  title: string
  description: string
  estimatedMinutes: number
  steps: TutorialStep[]
}

export const tutorialDefinitions: TutorialDefinition[] = [
  {
    key: 'getting-started',
    version: 1,
    kind: 'LearnOnly',
    title: 'Getting started',
    description:
      'Tour the Dashboard, Accounts, Monthly Budget, and CSV Import areas.',
    estimatedMinutes: 3,
    steps: [
      {
        title: 'Your starting point',
        body:
          'The Dashboard keeps your most useful BudgetApp shortcuts together.',
        route: '/dashboard',
        targetId: 'dashboard-welcome',
        advance: 'next',
      },
      {
        title: 'Open Accounts',
        body:
          'Accounts determine where transactions come from and whether activity is household or personal.',
        route: '/dashboard',
        targetId: 'nav-accounts',
        advance: 'click',
      },
      {
        title: 'Manage financial accounts',
        body:
          'This page is where you create, update, deactivate, and reactivate accounts.',
        route: '/accounts',
        targetId: 'accounts-page-title',
        advance: 'next',
      },
      {
        title: 'Open Monthly Budget',
        body:
          'Next, visit the monthly planning workspace.',
        route: '/accounts',
        targetId: 'nav-monthly-budget',
        advance: 'click',
      },
      {
        title: 'Plan one month at a time',
        body:
          'Monthly budgets can use household or personal scope and remain independent from annual targets.',
        route: '/budgeting',
        targetId: 'monthly-budget-page-title',
        advance: 'next',
      },
      {
        title: 'Open CSV Import',
        body:
          'Importing stages bank rows for review before they become official transactions.',
        route: '/budgeting',
        targetId: 'nav-import',
        advance: 'click',
      },
      {
        title: 'Imports start in review',
        body:
          'Choose an account and CSV file here. Uploaded rows are staged for review and do not appear in Transactions or budget totals until you approve them and create the approved transactions.',
        route: '/import',
        targetId: 'csv-import-page-title',
        advance: 'next',
      },
    ],
  },
]

export const tutorialByKey = new Map(
  tutorialDefinitions.map(tutorial => [tutorial.key, tutorial]),
)
