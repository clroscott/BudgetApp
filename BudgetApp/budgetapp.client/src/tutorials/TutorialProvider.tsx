import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { useRouter } from '../routing/useRouter'
import {
  tutorialByKey,
  type TutorialDefinition,
} from './tutorialDefinitions'
import {
  getTutorialProgress,
  saveTutorialProgress,
  type TutorialProgress,
} from './tutorialProgressApi'
import { TutorialContext, type TutorialContextValue } from './tutorialContext'
import { TutorialOverlay } from './TutorialOverlay'

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { navigate } = useRouter()
  const [progress, setProgress] = useState<TutorialProgress[]>([])
  const [activeTutorial, setActiveTutorial] =
    useState<TutorialDefinition | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setProgress([])
      setActiveTutorial(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    void getTutorialProgress()
      .then(result => {
        if (!cancelled) setProgress(result)
      })
      .catch(reason => {
        if (!cancelled) {
          setError(getErrorMessages(reason)[0] ?? 'Unable to load tutorials.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [user])

  const record = useCallback(async (
    tutorial: TutorialDefinition,
    status: TutorialProgress['status'],
    stepIndex: number,
  ) => {
    try {
      const saved = await saveTutorialProgress(
        tutorial.key,
        tutorial.version,
        status,
        stepIndex,
      )
      setProgress(current => [
        ...current.filter(item =>
          item.tutorialKey !== saved.tutorialKey ||
          item.tutorialVersion !== saved.tutorialVersion),
        saved,
      ])
      setError(null)
    } catch (reason) {
      setError(getErrorMessages(reason)[0] ?? 'Unable to save tutorial progress.')
    }
  }, [])

  const start = useCallback(async (tutorialKey: string, resume = false) => {
    const tutorial = tutorialByKey.get(tutorialKey)
    if (!tutorial) throw new Error('Tutorial was not found.')
    const saved = progress.find(item =>
      item.tutorialKey === tutorial.key &&
      item.tutorialVersion === tutorial.version)
    const stepIndex = resume && saved?.status === 'InProgress'
      ? Math.min(saved.currentStepIndex, tutorial.steps.length - 1)
      : 0
    setActiveTutorial(tutorial)
    setActiveStepIndex(stepIndex)
    await record(tutorial, 'InProgress', stepIndex)
    navigate(tutorial.steps[stepIndex].route)
  }, [navigate, progress, record])

  const dismiss = useCallback(async (tutorialKey: string) => {
    const tutorial = tutorialByKey.get(tutorialKey)
    if (!tutorial) return
    await record(tutorial, 'Dismissed', 0)
    if (activeTutorial?.key === tutorialKey) setActiveTutorial(null)
  }, [activeTutorial, record])

  const exit = useCallback(async () => {
    if (!activeTutorial) return
    await record(activeTutorial, 'InProgress', activeStepIndex)
    setActiveTutorial(null)
  }, [activeStepIndex, activeTutorial, record])

  const moveTo = useCallback(async (stepIndex: number) => {
    if (!activeTutorial) return
    if (stepIndex >= activeTutorial.steps.length) {
      await record(activeTutorial, 'Completed', activeTutorial.steps.length - 1)
      setActiveTutorial(null)
      navigate('/tutorials')
      return
    }
    const nextIndex = Math.max(0, stepIndex)
    setActiveStepIndex(nextIndex)
    await record(activeTutorial, 'InProgress', nextIndex)
    navigate(activeTutorial.steps[nextIndex].route)
  }, [activeTutorial, navigate, record])

  const next = useCallback(
    () => moveTo(activeStepIndex + 1),
    [activeStepIndex, moveTo],
  )
  const back = useCallback(
    () => moveTo(activeStepIndex - 1),
    [activeStepIndex, moveTo],
  )

  const value = useMemo<TutorialContextValue>(() => ({
    activeTutorial,
    activeStepIndex,
    isLoading,
    error,
    progress,
    start,
    dismiss,
    exit,
    next,
    back,
  }), [
    activeStepIndex,
    activeTutorial,
    back,
    dismiss,
    error,
    exit,
    isLoading,
    next,
    progress,
    start,
  ])

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialOverlay />
    </TutorialContext.Provider>
  )
}
