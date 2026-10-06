import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  const signedInUserId = user?.id
  const { navigate } = useRouter()
  const [progress, setProgress] = useState<TutorialProgress[]>([])
  const [activeTutorial, setActiveTutorial] =
    useState<TutorialDefinition | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveQueue = useRef(Promise.resolve())
  const revision = useRef(0)
  const currentSession = useRef({ userId: signedInUserId, active: false })

  useEffect(() => {
    const session = { userId: signedInUserId, active: true }
    currentSession.current = session
    saveQueue.current = Promise.resolve()
    const loadRevision = ++revision.current
    setActiveTutorial(null)
    setProgress([])
    if (!signedInUserId) {
      setIsLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    void getTutorialProgress()
      .then(result => {
        if (!cancelled && revision.current === loadRevision) setProgress(result)
      })
      .catch(reason => {
        if (!cancelled && revision.current === loadRevision) {
          setError(getErrorMessages(reason)[0] ?? 'Unable to load tutorials.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
      session.active = false
    }
  }, [signedInUserId])

  const record = useCallback(async (
    tutorial: TutorialDefinition,
    status: TutorialProgress['status'],
    stepIndex: number,
  ) => {
    const saveRevision = ++revision.current
    const session = currentSession.current
    // Checkpoints are metadata only. Serialize them so a slow earlier save cannot
    // overwrite a later Completed/replay checkpoint on the server.
    const pending = saveQueue.current.then(async () => {
      if (!session.userId || !session.active) return
      try {
        const saved = await saveTutorialProgress(tutorial.key, tutorial.version, status, stepIndex)
        if (!session.active || saveRevision !== revision.current) return
        setProgress(current => [
          ...current.filter(item => item.tutorialKey !== saved.tutorialKey || item.tutorialVersion !== saved.tutorialVersion), saved,
        ])
        setError(null)
      } catch (reason) {
        if (session.active && saveRevision === revision.current) {
          setError(getErrorMessages(reason)[0] ?? 'Unable to save tutorial progress.')
        }
      }
    })
    saveQueue.current = pending
    await pending
  }, [])

  const start = useCallback(async (tutorialKey: string, resume = false) => {
    const tutorial = tutorialByKey.get(tutorialKey)
    if (!tutorial) throw new Error('Tutorial was not found.')
    const saved = progress.find(item =>
      item.tutorialKey === tutorial.key &&
      item.tutorialVersion === tutorial.version)
    const stepIndex = resume && saved?.status === 'InProgress'
      ? Math.max(0, Math.min(saved.currentStepIndex, tutorial.steps.length - 1))
      : 0
    if (!navigate(tutorial.steps[stepIndex].route)) return
    setActiveTutorial(tutorial)
    setActiveStepIndex(stepIndex)
    await record(tutorial, 'InProgress', stepIndex)
  }, [navigate, progress, record])

  const dismiss = useCallback(async (tutorialKey: string) => {
    const tutorial = tutorialByKey.get(tutorialKey)
    if (!tutorial) return
    if (activeTutorial?.key === tutorialKey) setActiveTutorial(null)
    await record(tutorial, 'Dismissed', 0)
  }, [activeTutorial, record])

  const exit = useCallback(async () => {
    if (!activeTutorial) return
    setActiveTutorial(null)
    await record(activeTutorial, 'InProgress', activeStepIndex)
  }, [activeStepIndex, activeTutorial, record])

  const moveTo = useCallback(async (stepIndex: number) => {
    if (!activeTutorial) return
    if (stepIndex >= activeTutorial.steps.length) {
      if (!navigate('/tutorials')) return
      setActiveTutorial(null)
      await record(activeTutorial, 'Completed', activeTutorial.steps.length - 1)
      return
    }
    const nextIndex = Math.max(0, stepIndex)
    if (!navigate(activeTutorial.steps[nextIndex].route)) return
    setActiveStepIndex(nextIndex)
    await record(activeTutorial, 'InProgress', nextIndex)
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
