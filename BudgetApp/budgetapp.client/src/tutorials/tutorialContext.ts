import { createContext } from 'react'
import type { TutorialDefinition } from './tutorialDefinitions'
import type { TutorialProgress } from './tutorialProgressApi'
import type { ImportTutorialControls } from './importTutorialState'
import type { BudgetTutorialControls } from './budgetTutorialState'

export interface TutorialContextValue {
  activeTutorial: TutorialDefinition | null
  activeStepIndex: number
  isLoading: boolean
  error: string | null
  progress: TutorialProgress[]
  start: (tutorialKey: string, resume?: boolean) => Promise<void>
  dismiss: (tutorialKey: string) => Promise<void>
  exit: () => Promise<void>
  next: () => Promise<void>
  back: () => Promise<void>
  importGuide?: ImportTutorialControls
  budgetGuide?: BudgetTutorialControls
}

export const TutorialContext = createContext<TutorialContextValue | null>(null)
