import { createContext } from 'react'
import type { TutorialDefinition } from './tutorialDefinitions'
import type { TutorialProgress } from './tutorialProgressApi'
import type { ImportTutorialControls } from './importTutorialState'
import type { BudgetTutorialControls } from './budgetTutorialState'
import type { ReadTutorialControls } from './readTutorialState'
import type { DashboardTutorialControls } from './dashboardTutorialState'
import type { RecurringTutorialControls } from './recurringTutorialState'
import type { ProfileTutorialControls } from './profileTutorialState'
import type { SetupTutorialControls } from './setupTutorialState'
import type { InvitationTutorialControls } from './invitationTutorialState'
import type { TransactionTutorialControls } from './transactionTutorialState'
import type { CategorizationControls } from './categorizationTutorialState'
import type { ImportRecoveryControls } from './importRecoveryTutorialState'
import type { ImportProblemsControls } from './importProblemsTutorialState'
import type { LifecycleControls } from './lifecycleTutorialState'
import type { AnnualBudgetControls } from './annualBudgetTutorialState'

export interface TutorialContextValue {
  activeTutorial: TutorialDefinition | null
  activeStepIndex: number
  isLoading: boolean
  error: string | null
  progress: TutorialProgress[]
  start: (tutorialKey: string, resume?: boolean) => Promise<void>
  dismiss: (tutorialKey: string) => Promise<void>
  exit: () => Promise<void>
  next: (continueTask?: boolean) => Promise<void>
  back: () => Promise<void>
  importGuide?: ImportTutorialControls
  budgetGuide?: BudgetTutorialControls
  readGuide?: ReadTutorialControls
  dashboardGuide?: DashboardTutorialControls
  recurringGuide?: RecurringTutorialControls
  profileGuide?: ProfileTutorialControls
  setupGuide?: SetupTutorialControls
  invitationGuide?: InvitationTutorialControls
  transactionGuide?: TransactionTutorialControls
  categorizationGuide?: CategorizationControls
  recoveryGuide?: ImportRecoveryControls
  problemsGuide?: ImportProblemsControls
  lifecycleGuide?: LifecycleControls
  annualGuide?: AnnualBudgetControls
}

export const TutorialContext = createContext<TutorialContextValue | null>(null)
