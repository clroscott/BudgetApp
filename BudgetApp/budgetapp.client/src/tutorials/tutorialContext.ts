import { createContext } from 'react'
import type { TutorialDefinition } from './tutorialDefinitions'
import type { TutorialProgress } from './tutorialProgressApi'

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
}

export const TutorialContext = createContext<TutorialContextValue | null>(null)
