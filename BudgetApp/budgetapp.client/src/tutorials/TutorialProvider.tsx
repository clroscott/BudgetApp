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
import { useHouseholds } from '../households/useHouseholds'
import { ImportTutorialPageContext, importTutorialGate, importTutorialKey, importTutorialRoute,
  type ImportTutorialPage, type ImportTutorialTask } from './importTutorialState'
import { BudgetTutorialPageContext, budgetTutorialGate, budgetTutorialKey, budgetTutorialRoute, budgetTutorialSteps, budgetTutorialStepOverride,
  type BudgetTutorialPage, type BudgetTutorialTask } from './budgetTutorialState'

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const signedInUserId = user?.emailConfirmed ? user.id : undefined
  const { navigate, path } = useRouter()
  const { currentHousehold } = useHouseholds()
  const householdId = currentHousehold?.id
  const [budgetTask, setBudgetTask] = useState<BudgetTutorialTask | null>(null)
  const [budgetPage, setBudgetPage] = useState<{ owner: symbol; value: BudgetTutorialPage } | null>(null)
  const publishBudgetPage = useCallback((owner: symbol, page: BudgetTutorialPage | null) => {
    setBudgetPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [importTask, setImportTask] = useState<ImportTutorialTask | null>(null)
  const [reportedPage, setReportedPage] = useState<{ owner: symbol; value: ImportTutorialPage } | null>(null)
  const publishImportPage = useCallback((owner: symbol, page: ImportTutorialPage | null) => {
    setReportedPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
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
    setImportTask(null)
    setBudgetTask(null)
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
    if (!signedInUserId) return
    const tutorial = tutorialByKey.get(tutorialKey)
    if (!tutorial) throw new Error('Tutorial was not found.')
    const saved = progress.find(item =>
      item.tutorialKey === tutorial.key &&
      item.tutorialVersion === tutorial.version)
    // Saved progress intentionally contains no account/import/file context. A
    // guided resume starts with explicit selection and fresh authoritative reads.
    const stepIndex = tutorial.resumeBehavior !== 'restart' && resume && saved?.status === 'InProgress'
      ? Math.max(0, Math.min(saved.currentStepIndex, tutorial.steps.length - 1))
      : 0
    if (!(tutorialKey === budgetTutorialKey && path === '/budgeting') && !navigate(tutorial.steps[stepIndex].route)) return
    setActiveTutorial(tutorial)
    setImportTask(tutorial.key === importTutorialKey && householdId ? { householdId } : null)
    setBudgetTask(null)
    setActiveStepIndex(stepIndex)
    await record(tutorial, 'InProgress', stepIndex)
  }, [navigate, path, progress, record, signedInUserId, householdId])

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

  const moveTo = useCallback(async (stepIndex: number, keepDraft = false, completionDestination: 'budget' | 'tutorials' = 'tutorials') => {
    if (!activeTutorial) return
    let selectedBudget = budgetTask
    if (activeTutorial.key === budgetTutorialKey) {
      const page = budgetPage?.value ?? null
      const gate = budgetTutorialGate(activeStepIndex, budgetTask, householdId, currentHousehold?.role, page)
      if (stepIndex > activeStepIndex) {
        if (keepDraft ? activeStepIndex !== budgetTutorialSteps.activate || !gate.canKeepDraft : !gate.canNext) return
        if (!page || !householdId || !currentHousehold) return
        if (activeStepIndex === 0) selectedBudget = { householdId, role: currentHousehold.role,
          year: page.year, month: page.month, scope: page.scope, budgetId: page.budgetId ?? undefined }
        if (activeStepIndex === 1) selectedBudget = { ...selectedBudget!, budgetId: page.budgetId! }
        if (activeStepIndex === budgetTutorialSteps.activate) selectedBudget = { ...selectedBudget!, finishStatus: page.status! }
      }
      if (stepIndex === 0) selectedBudget = null
    }
    let task = importTask
    const page = reportedPage?.value ?? null
    if (activeTutorial.key === importTutorialKey) {
      if (stepIndex > activeStepIndex && !importTutorialGate(activeStepIndex, task, householdId, page).canNext) return
      if (activeStepIndex === 0 && stepIndex > 0) return // Must choose a task explicitly.
      if (stepIndex > activeStepIndex && page?.page === 'upload') {
        if (activeStepIndex === 1) task = { ...task!, accountId: page.accountId }
        if (activeStepIndex === 3 && page.stagedId) task = { ...task!, importId: page.stagedId }
      }
      if (stepIndex > activeStepIndex && page?.page === 'review' && activeStepIndex >= 4) {
        task = { ...task!, importId: page.importId }
        if (page.status === 'Completed' && stepIndex < 9) stepIndex = 9
      }
    }
    if (stepIndex >= activeTutorial.steps.length) {
      const stayOnBudget = activeTutorial.key === budgetTutorialKey && completionDestination === 'budget' && path === '/budgeting'
      if (!stayOnBudget && !navigate('/tutorials')) return
      setActiveTutorial(null)
      await record(activeTutorial, 'Completed', activeTutorial.steps.length - 1)
      return
    }
    const nextIndex = Math.max(0, stepIndex)
    const route = activeTutorial.key === importTutorialKey ? importTutorialRoute(nextIndex, task)
      : activeTutorial.key === budgetTutorialKey ? budgetTutorialRoute(selectedBudget) : activeTutorial.steps[nextIndex].route
    // Monthly selectors are local state. Stepping within the same page must not
    // replace its URL or trigger an unsaved-change prompt/discard.
    if (!(activeTutorial.key === budgetTutorialKey && path === '/budgeting') && !navigate(route)) return
    setImportTask(task)
    setBudgetTask(selectedBudget)
    setActiveStepIndex(nextIndex)
    await record(activeTutorial, 'InProgress', nextIndex)
  }, [activeTutorial, activeStepIndex, importTask, reportedPage, householdId, navigate, record, budgetTask, budgetPage, currentHousehold, path])

  const chooseImportPath = useCallback((path: 'upload' | 'existing') => {
    if (activeTutorial?.key !== importTutorialKey || !householdId || importTask?.householdId !== householdId) return
    const index = path === 'upload' ? 1 : 4
    const task = { householdId }
    if (!navigate(importTutorialRoute(index, task))) return
    setImportTask(task)
    setActiveStepIndex(index)
    void record(activeTutorial, 'InProgress', index)
  }, [activeTutorial, householdId, importTask, navigate, record])

  const next = useCallback(
    () => moveTo(activeStepIndex + 1),
    [activeStepIndex, moveTo],
  )
  const back = useCallback(
    () => moveTo(activeTutorial?.key === importTutorialKey && activeStepIndex === 4 ? 0 : activeStepIndex - 1),
    [activeTutorial, activeStepIndex, moveTo],
  )

  const restartImport = useCallback(() => { void start(importTutorialKey) }, [start])
  const returnToImport = useCallback(() => {
    if (importTask?.householdId === householdId) navigate(importTutorialRoute(activeStepIndex, importTask))
  }, [importTask, householdId, navigate, activeStepIndex])
  const importGuide = useMemo(() => activeTutorial?.key === importTutorialKey ? {
    ...importTutorialGate(activeStepIndex, importTask, householdId, reportedPage?.value ?? null),
    canBack: activeStepIndex > 0 && !reportedPage?.value.busy,
    choose: chooseImportPath,
    restart: restartImport,
    returnToTask: returnToImport,
  } : undefined, [activeTutorial, activeStepIndex, importTask, householdId, reportedPage, chooseImportPath, restartImport, returnToImport])

  const budgetGuide = useMemo(() => activeTutorial?.key === budgetTutorialKey ? {
    ...budgetTutorialGate(activeStepIndex, budgetTask, householdId, currentHousehold?.role, path === '/budgeting' ? budgetPage?.value ?? null : null),
    canBack: activeStepIndex > 0 && !budgetPage?.value.busy,
    keepDraft: () => { void moveTo(budgetTutorialSteps.done, true) },
    complete: (destination: 'budget' | 'tutorials') => {
      if (activeStepIndex === activeTutorial.steps.length - 1) void moveTo(activeTutorial.steps.length, false, destination)
    },
    stepOverride: budgetTutorialStepOverride(activeStepIndex, budgetPage?.value ?? null),
    restart: () => { void start(budgetTutorialKey) },
    returnToTask: () => {
      if (!budgetTask || budgetTask.householdId === householdId) navigate(budgetTutorialRoute(budgetTask))
    },
  } : undefined, [activeTutorial, activeStepIndex, budgetTask, householdId, currentHousehold?.role, path, budgetPage, moveTo, start, navigate])

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
    importGuide,
    budgetGuide,
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
    importGuide,
    budgetGuide,
  ])

  return (
    <TutorialContext.Provider value={value}>
      <BudgetTutorialPageContext.Provider value={publishBudgetPage}>
        <ImportTutorialPageContext.Provider value={publishImportPage}>{children}</ImportTutorialPageContext.Provider>
      </BudgetTutorialPageContext.Provider>
      <TutorialOverlay />
    </TutorialContext.Provider>
  )
}
