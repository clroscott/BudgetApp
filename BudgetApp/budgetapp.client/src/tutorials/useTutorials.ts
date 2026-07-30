import { useContext } from 'react'
import { TutorialContext, type TutorialContextValue } from './tutorialContext'

export function useTutorials(): TutorialContextValue {
  const context = useContext(TutorialContext)
  if (!context) throw new Error('useTutorials must be used inside TutorialProvider.')
  return context
}
