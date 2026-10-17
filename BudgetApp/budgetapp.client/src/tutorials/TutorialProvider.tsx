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
import { ReadTutorialPageContext, readTutorialGate, type ReadTutorialPage } from './readTutorialState'
import { DashboardTutorialPageContext, dashboardTutorialKey, dashboardTutorialGate, type DashboardTutorialPage } from './dashboardTutorialState'
import { RecurringTutorialPageContext, recurringTutorialKey, recurringTutorialGate, recurringTutorialRoute,
  type RecurringTutorialPage, type RecurringTutorialTask } from './recurringTutorialState'
import { ProfileTutorialPageContext, profileTutorialKey, profileTutorialGate, type ProfileTutorialPage, type ProfileTutorialTask } from './profileTutorialState'
import { SetupTutorialPageContext, setupTutorialKey, setupTutorialGate, setupTutorialRoute,
  type SetupTutorialPage, type SetupTutorialTask, type SetupSection } from './setupTutorialState'
import { InvitationTutorialPageContext, invitationTutorialKey, invitationTutorialGate, invitationStepOverride,
  type InvitationTutorialPage, type InvitationTutorialTask } from './invitationTutorialState'
import { TransactionTutorialPageContext, transactionTutorialKey, transactionTutorialGate, transactionStepOverride,
  type TransactionTutorialPage, type TransactionTutorialTask } from './transactionTutorialState'
import { RuleTutorialPageContext, categorizationTutorialKey, categorizationGate, categoryTutorialRoute, type RuleTutorialPage, type CategorizationTask } from './categorizationTutorialState'
import { RecoveryPreviewContext, importRecoveryTutorialKey, recoveryGate, type RecoveryPreviewPage, type ImportRecoveryTask, type ImportRecoveryAction } from './importRecoveryTutorialState'
import { importProblemsTutorialKey, problemsGate, problemsRoute, type ImportProblemsTask } from './importProblemsTutorialState'
import { AnnualTutorialPageContext, lifecycleTutorialKey, annualTutorialKey, type AnnualTutorialPage } from './annualTutorialState'
import { lifecycleGate, lifecycleRoute, type LifecycleTask, type LifecycleMode } from './lifecycleTutorialState'
import { annualBudgetGate, annualBudgetRoute, type AnnualBudgetTask } from './annualBudgetTutorialState'

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const signedInUserId = user?.emailConfirmed ? user.id : undefined
  const { navigate, path } = useRouter()
  const { currentHousehold } = useHouseholds()
  const householdId = currentHousehold?.id
  const [annualTask, setAnnualTask] = useState<AnnualBudgetTask | null>(null)
  const [lifecycleTask, setLifecycleTask] = useState<LifecycleTask | null>(null)
  const [annualPage, setAnnualPage] = useState<{ owner: symbol; value: AnnualTutorialPage } | null>(null)
  const publishAnnualPage = useCallback((owner: symbol, page: AnnualTutorialPage | null) => {
    setAnnualPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [problemsTask, setProblemsTask] = useState<ImportProblemsTask | null>(null)
  const [recoveryTask, setRecoveryTask] = useState<ImportRecoveryTask | null>(null)
  const [recoveryPreview, setRecoveryPreview] = useState<{ owner: symbol; value: RecoveryPreviewPage } | null>(null)
  const publishRecoveryPreview = useCallback((owner: symbol, page: RecoveryPreviewPage | null) => {
    setRecoveryPreview(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [categoryTask, setCategoryTask] = useState<CategorizationTask | null>(null)
  const [rulePage, setRulePage] = useState<{ owner: symbol; value: RuleTutorialPage } | null>(null)
  const publishRulePage = useCallback((owner: symbol, page: RuleTutorialPage | null) => {
    setRulePage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [transactionPage, setTransactionPage] = useState<{ owner: symbol; value: TransactionTutorialPage } | null>(null)
  const [transactionTask, setTransactionTask] = useState<TransactionTutorialTask | null>(null)
  const publishTransactionPage = useCallback((owner: symbol, page: TransactionTutorialPage | null) => {
    setTransactionPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [invitationPage, setInvitationPage] = useState<{ owner: symbol; value: InvitationTutorialPage } | null>(null)
  const [invitationTask, setInvitationTask] = useState<InvitationTutorialTask | null>(null)
  const publishInvitationPage = useCallback((owner: symbol, page: InvitationTutorialPage | null) => {
    setInvitationPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [setupPage, setSetupPage] = useState<{ owner: symbol; value: SetupTutorialPage } | null>(null)
  const [setupTask, setSetupTask] = useState<SetupTutorialTask | null>(null)
  const publishSetupPage = useCallback((owner: symbol, page: SetupTutorialPage | null) => {
    setSetupPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [profilePage, setProfilePage] = useState<{ owner: symbol; value: ProfileTutorialPage } | null>(null)
  const [profileTask, setProfileTask] = useState<ProfileTutorialTask | null>(null)
  const publishProfilePage = useCallback((owner: symbol, page: ProfileTutorialPage | null) => {
    setProfilePage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [recurringPage, setRecurringPage] = useState<{ owner: symbol; value: RecurringTutorialPage } | null>(null)
  const [recurringTask, setRecurringTask] = useState<RecurringTutorialTask | null>(null)
  const publishRecurringPage = useCallback((owner: symbol, page: RecurringTutorialPage | null) => {
    setRecurringPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [dashboardPage, setDashboardPage] = useState<{ owner: symbol; value: DashboardTutorialPage } | null>(null)
  const [dashboardTask, setDashboardTask] = useState<{ householdId: string; role: string } | null>(null)
  const publishDashboardPage = useCallback((owner: symbol, page: DashboardTutorialPage | null) => {
    setDashboardPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [])
  const [readPage, setReadPage] = useState<{ owner: symbol; value: ReadTutorialPage } | null>(null)
  const [readTask, setReadTask] = useState<{ householdId: string; role: string } | null>(null)
  const readRoutes = useRef<Record<string, string>>({})
  const publishReadPage = useCallback((owner: symbol, page: ReadTutorialPage | null) => {
    if (page && page.householdId === householdId) readRoutes.current[page.path] = page.url
    setReadPage(current => page ? current?.owner === owner && JSON.stringify(current.value) === JSON.stringify(page)
      ? current : { owner, value: page } : current?.owner === owner ? null : current)
  }, [householdId])
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
    setReadTask(null)
    setDashboardTask(null)
    setRecurringTask(null)
    setProfileTask(null)
    setSetupTask(null)
    setInvitationTask(null)
    setTransactionTask(null)
    setCategoryTask(null)
    setRecoveryTask(null)
    setProblemsTask(null)
    setLifecycleTask(null)
    setAnnualTask(null)
    readRoutes.current = {}
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
    const sameReadPage = tutorial.presentation === 'read-companion' && path === tutorial.steps[stepIndex].route
    const sameDashboard = tutorialKey === dashboardTutorialKey && path === '/dashboard' || tutorialKey === lifecycleTutorialKey && path === '/budgeting'
    const sameRecurring = tutorialKey === recurringTutorialKey && path === '/budgeting/recurring-expenses'
    const sameProfile = tutorialKey === profileTutorialKey && path === '/settings/import-profiles' || tutorialKey === importProblemsTutorialKey && path === '/import'
    const sameSetup = tutorialKey === setupTutorialKey && path === '/accounts' || tutorialKey === annualTutorialKey && path === '/budgeting/annual-targets'
    const sameInvitation = tutorialKey === invitationTutorialKey && path === '/household' || tutorialKey === importRecoveryTutorialKey && path === '/imports/review'
    const sameTransaction = [transactionTutorialKey, categorizationTutorialKey].includes(tutorialKey) && path === '/transactions'
    if (!sameReadPage && !sameDashboard && !sameRecurring && !sameProfile && !sameSetup && !sameInvitation && !sameTransaction && !(tutorialKey === budgetTutorialKey && path === '/budgeting') && !navigate(tutorial.steps[stepIndex].route)) return
    setActiveTutorial(tutorial)
    setImportTask(tutorial.key === importTutorialKey && householdId ? { householdId } : null)
    setBudgetTask(null)
    setReadTask(null)
    setDashboardTask(null)
    setRecurringTask(null)
    setProfileTask(null)
    setSetupTask(null)
    setInvitationTask(null)
    setTransactionTask(null)
    setCategoryTask(null)
    setRecoveryTask(null)
    setProblemsTask(null)
    setLifecycleTask(null)
    setAnnualTask(null)
    readRoutes.current = {}
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

  const moveTo = useCallback(async (stepIndex: number, keepDraft = false, completionDestination: 'task' | 'tutorials' = 'tutorials') => {
    if (!activeTutorial) return
    const isRead = activeTutorial.presentation === 'read-companion'
    const isDashboard = activeTutorial.key === dashboardTutorialKey
    const isRecurring = activeTutorial.key === recurringTutorialKey
    const isProfile = activeTutorial.key === profileTutorialKey
    const isSetup = activeTutorial.key === setupTutorialKey
    const isInvitation = activeTutorial.key === invitationTutorialKey
    const isTransaction = activeTutorial.key === transactionTutorialKey
    const isCategory = activeTutorial.key === categorizationTutorialKey
    const isRecovery = activeTutorial.key === importRecoveryTutorialKey
    const isProblems = activeTutorial.key === importProblemsTutorialKey
    const isLifecycle = activeTutorial.key === lifecycleTutorialKey
    const isAnnual = activeTutorial.key === annualTutorialKey
    let selectedAnnual = annualTask
    if (isAnnual) {
      if (stepIndex < activeStepIndex && annualTask?.annualOnly) selectedAnnual = { ...annualTask, annualOnly: false }
      if (stepIndex > activeStepIndex) {
        if (!annualBudgetGate(activeStepIndex, householdId, currentHousehold?.role, annualTask,
          path === '/budgeting/annual-targets' ? annualPage?.value ?? null : null, path === '/budgeting' ? budgetPage?.value ?? null : null).canNext) return
        if (activeStepIndex === 0 && annualPage && householdId && currentHousehold) selectedAnnual = {
          householdId, role: currentHousehold.role, year: annualPage.value.year, startMonth: annualPage.value.startMonth,
          scope: annualPage.value.scope, planId: annualPage.value.planId ?? undefined }
        if (activeStepIndex === 2 && annualPage?.value.planId) selectedAnnual = { ...selectedAnnual!, planId: annualPage.value.planId }
        if (activeStepIndex === 7 && budgetPage?.value.status) selectedAnnual = { ...selectedAnnual!, finishStatus: budgetPage.value.status }
      }
      if (stepIndex === 0) selectedAnnual = null
    }
    let selectedLifecycle = lifecycleTask
    if (isLifecycle) {
      if (stepIndex > activeStepIndex) {
        if (activeStepIndex === 0 || !lifecycleGate(activeStepIndex, householdId, currentHousehold?.role, lifecycleTask,
          path === '/budgeting' ? budgetPage?.value ?? null : null, path === '/budgeting/annual-targets' ? annualPage?.value ?? null : null).canNext) return
        if (activeStepIndex === 1 && budgetPage) selectedLifecycle = { ...selectedLifecycle!, year: budgetPage.value.year, month: budgetPage.value.month,
          scope: budgetPage.value.scope, budgetId: budgetPage.value.budgetId ?? undefined, copySource: budgetPage.value.copySource }
        if (activeStepIndex === 2 && budgetPage?.value.budgetId) selectedLifecycle = { ...selectedLifecycle!, budgetId: budgetPage.value.budgetId }
        if (activeStepIndex === 3) stepIndex = 6 // Replacement is independently optional.
        if (activeStepIndex === 4 && annualPage?.value.planId) selectedLifecycle = { ...selectedLifecycle!, annual: {
          year: annualPage.value.year, startMonth: annualPage.value.startMonth, planId: annualPage.value.planId, baselineRevision: annualPage.value.allocationRevision } }
        if (activeStepIndex === 5) selectedLifecycle = { ...selectedLifecycle!, replaced: true }
      }
      if (stepIndex === 0) selectedLifecycle = null
    }
    let selectedProblem = problemsTask
    if (isProblems) {
      const page = path === '/import' || path === '/imports/review' ? reportedPage?.value ?? null : null
      if (stepIndex > activeStepIndex) {
        if (activeStepIndex === 0 || !problemsGate(activeStepIndex, householdId, currentHousehold?.role, problemsTask, page).canNext) return
        if (activeStepIndex === 1 && page?.page === 'upload') selectedProblem = { ...selectedProblem!, accountId: page.accountId, fileRevision: page.fileRevision }
        if (activeStepIndex >= 1 && activeStepIndex <= 3 && page?.page === 'upload' && page.stagedId) {
          selectedProblem = { ...selectedProblem!, importId: page.stagedId, url: `/imports/review?importId=${encodeURIComponent(page.stagedId)}` }; stepIndex = 4
        }
        if (activeStepIndex === 4 && page?.page === 'review') selectedProblem = { ...selectedProblem!, importId: page.importId, url: page.url }
      }
      if (stepIndex === 0) selectedProblem = null
    }
    if (isRecovery && stepIndex > activeStepIndex) {
      const page = path === '/imports/review' ? reportedPage?.value ?? null : null
      if (activeStepIndex === 1 || !recoveryGate(activeStepIndex, householdId, currentHousehold?.role, recoveryTask, page, recoveryPreview?.value ?? null).canNext) return
      if (activeStepIndex === 0 && page?.page === 'review' && householdId && currentHousehold) setRecoveryTask({ householdId, role: currentHousehold.role, importId: page.importId, url: page.url ?? `/imports/review?importId=${encodeURIComponent(page.importId)}` })
    }
    if (isRecovery && stepIndex === 0) setRecoveryTask(null)
    let selectedCategory = categoryTask
    if (isCategory) {
      if (stepIndex > activeStepIndex) {
        if (activeStepIndex === 0 || !categorizationGate(activeStepIndex, householdId, currentHousehold?.role, categoryTask,
          path === '/transactions' ? transactionPage?.value ?? null : null, path === '/imports/review' ? reportedPage?.value ?? null : null,
          path === '/settings/categorization-rules' ? rulePage?.value ?? null : null).canNext) return
        if (activeStepIndex === 1) selectedCategory = { ...selectedCategory!, selection: categoryTask?.mode === 'posted' ? transactionPage?.value.selection ?? undefined : reportedPage?.value.page === 'review' ? reportedPage.value.importId : undefined,
          url: categoryTask?.mode === 'posted' ? transactionPage?.value.url : reportedPage?.value.page === 'review' ? reportedPage.value.url : undefined,
          baselineRevision: transactionPage?.value.outcomeRevision }
        if (activeStepIndex === 4) stepIndex = 8 // Rules are an explicitly optional branch.
        if (activeStepIndex === 5) selectedCategory = { ...selectedCategory!, ruleSelection: rulePage?.value.selection ?? undefined }
        if (activeStepIndex === 6) selectedCategory = { ...selectedCategory!, ruleId: rulePage?.value.ruleId ?? undefined }
      }
      if (stepIndex === 0) selectedCategory = null
    }
    let selectedTransaction = transactionTask
    if (isTransaction) {
      const page = path === '/transactions' ? transactionPage?.value ?? null : null
      if (stepIndex > activeStepIndex) {
        if (!transactionTutorialGate(activeStepIndex, householdId, currentHousehold?.role, transactionTask, page).canNext || !page || !householdId || !currentHousehold) return
        if (activeStepIndex === 0) selectedTransaction = { householdId, role: currentHousehold.role, url: page.url }
        if (activeStepIndex === 2) {
          selectedTransaction = { ...selectedTransaction!, url: page.url, selection: page.selection!, baselineRevision: page.outcomeRevision,
            finish: page.selection === 'review' ? 'review' : undefined }
          if (page.selection === 'review') stepIndex = 7
        }
        if (activeStepIndex >= 3 && activeStepIndex <= 5 && page.outcomeRevision > (transactionTask?.baselineRevision ?? 0) && !page.dirty && page.editingId === null) stepIndex = 6
        if (activeStepIndex === 3 && !page.canEdit) { stepIndex = 6; selectedTransaction = { ...selectedTransaction!, finish: 'readonly' } }
      }
      if (stepIndex === 0) selectedTransaction = null
      if (stepIndex === 7 && selectedTransaction && page?.url !== selectedTransaction.url && !navigate(selectedTransaction.url)) return
    }
    let selectedInvitation = invitationTask
    if (isInvitation) {
      if (stepIndex > activeStepIndex) {
        if (!invitationTutorialGate(activeStepIndex, householdId, currentHousehold?.role, invitationTask,
          path === '/household' ? invitationPage?.value ?? null : null).canNext) return
        if (activeStepIndex === 0 && householdId && currentHousehold && invitationPage?.value.selection)
          selectedInvitation = { householdId, role: currentHousehold.role, selection: invitationPage.value.selection }
        if (activeStepIndex === 3 && invitationPage?.value.invitationId) selectedInvitation = { ...selectedInvitation!, invitationId: invitationPage.value.invitationId }
      }
      if (stepIndex === 0) selectedInvitation = null
    }
    let selectedSetup = setupTask
    if (isSetup) {
      if (stepIndex > activeStepIndex) {
        if (activeStepIndex === 0 || !setupTutorialGate(activeStepIndex, householdId, currentHousehold?.role, setupTask, setupPage?.value ?? null).canNext) return
        if (activeStepIndex === 1 && setupPage?.value.selection) selectedSetup = { ...selectedSetup!, selection: setupPage.value.selection }
        if (activeStepIndex === 3 && setupPage?.value.accountId) {
          selectedSetup = { ...selectedSetup!, accountId: setupPage.value.accountId }
          if (selectedSetup.section === 'accounts') stepIndex = 6
        }
      }
      if (stepIndex === 0) selectedSetup = null
    }
    let selectedProfile = profileTask
    if (isProfile) {
      if (stepIndex > activeStepIndex) {
        if (!profileTutorialGate(activeStepIndex, householdId, currentHousehold?.role, profileTask, profilePage?.value ?? null).canNext) return
        if (!householdId || !currentHousehold) return
        if (activeStepIndex === 0 && profilePage?.value.selection) selectedProfile = { householdId, role: currentHousehold.role, selection: profilePage.value.selection }
        if (activeStepIndex === 4 && profilePage?.value.profileId) selectedProfile = { ...selectedProfile!, profileId: profilePage.value.profileId }
      }
      if (stepIndex === 0) selectedProfile = null
    }
    let selectedRecurring = recurringTask
    if (isRecurring) {
      if (stepIndex > activeStepIndex) {
        if (!recurringTutorialGate(activeStepIndex, householdId, currentHousehold?.role, recurringTask,
          path === '/budgeting/recurring-expenses' ? recurringPage?.value ?? null : null,
          path === '/budgeting' ? budgetPage?.value ?? null : null).canNext) return
        if (!householdId || !currentHousehold) return
        if (activeStepIndex === 0 && recurringPage?.value.selection && recurringPage.value.scope)
          selectedRecurring = { householdId, role: currentHousehold.role, selection: recurringPage.value.selection, scope: recurringPage.value.scope }
        if (activeStepIndex === 5) {
          if (stepIndex === 6) {
            if (currentHousehold.role === 'Viewer') return
            selectedRecurring = { ...selectedRecurring!, monthly: true }
          } else { stepIndex = 8; selectedRecurring = { ...selectedRecurring!, monthly: false, budget: undefined } }
        }
        if (activeStepIndex === 4 && recurringPage?.value.expenseId) selectedRecurring = { ...selectedRecurring!, expenseId: recurringPage.value.expenseId }
        if (activeStepIndex === 6 && budgetPage) selectedRecurring = { ...selectedRecurring!, budget: {
          year: budgetPage.value.year, month: budgetPage.value.month, scope: budgetPage.value.scope, budgetId: budgetPage.value.budgetId ?? undefined } }
        if (activeStepIndex === 7 && budgetPage?.value.budgetId) selectedRecurring = { ...selectedRecurring!, budget: {
          ...selectedRecurring!.budget!, budgetId: budgetPage.value.budgetId } }
      }
      if (stepIndex === 0) selectedRecurring = null
    }
    if (isDashboard && stepIndex > activeStepIndex) {
      if (!dashboardTutorialGate(activeStepIndex, householdId, currentHousehold?.role, dashboardTask, path === '/dashboard' ? dashboardPage?.value ?? null : null).canNext) return
      if (!dashboardTask && householdId && currentHousehold) setDashboardTask({ householdId, role: currentHousehold.role })
    }
    if (isRead) {
      const step = activeTutorial.steps[activeStepIndex]
      const navigationConfirmed = step.advance === 'click' && path === activeTutorial.steps[activeStepIndex + 1]?.route
      const gate = readTutorialGate(householdId, currentHousehold?.role, readTask, readPage?.value ?? null, path, step.route, navigationConfirmed)
      if (stepIndex > activeStepIndex && !gate.canNext) return
      if (!readTask && householdId && currentHousehold) setReadTask({ householdId, role: currentHousehold.role })
      if (readPage && readPage.value.householdId === householdId) readRoutes.current[readPage.value.path] = readPage.value.url
    }
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
      const stayOnTask = completionDestination === 'task' && (activeTutorial.key === budgetTutorialKey && path === '/budgeting'
        || isDashboard && path === '/dashboard'
        || isRecurring && (path === '/budgeting/recurring-expenses' || path === '/budgeting')
        || isProfile && path === '/import'
        || isSetup && (path === '/accounts' || path === '/settings/categories')
        || isInvitation && path === '/household'
        || isTransaction && path === '/transactions'
        || isCategory && (path === '/transactions' || path === '/imports/review')
        || isRecovery && path === '/imports/review'
        || isProblems && (path === '/import' || path === '/imports/review')
        || isLifecycle && path === '/budgeting'
        || isAnnual && (path === '/budgeting' || path === '/budgeting/annual-targets')
        || isRead && path === activeTutorial.steps[activeStepIndex].route)
      if (!stayOnTask && !navigate('/tutorials')) return
      setActiveTutorial(null)
      await record(activeTutorial, 'Completed', activeTutorial.steps.length - 1)
      return
    }
    const nextIndex = Math.max(0, stepIndex)
    const route = activeTutorial.key === importTutorialKey ? importTutorialRoute(nextIndex, task)
      : activeTutorial.key === budgetTutorialKey ? budgetTutorialRoute(selectedBudget)
      : isRecurring ? recurringTutorialRoute(nextIndex, selectedRecurring)
      : isSetup ? setupTutorialRoute(nextIndex, selectedSetup) : activeTutorial.steps[nextIndex].route
    const destination = isAnnual ? annualBudgetRoute(nextIndex, selectedAnnual) : isLifecycle ? lifecycleRoute(nextIndex, selectedLifecycle) : isProblems ? problemsRoute(nextIndex, selectedProblem) : isCategory ? categoryTutorialRoute(nextIndex, selectedCategory) : route
    // Monthly selectors are local state. Stepping within the same page must not
    // replace its URL or trigger an unsaved-change prompt/discard.
    if (!(isAnnual && path === destination.split('?')[0]) && !(isLifecycle && path === destination.split('?')[0]) && !(isProblems && path === destination.split('?')[0]) && !(isRecovery && path === '/imports/review') && !(isCategory && path === destination.split('?')[0]) && !((isSetup || isProfile || isInvitation || isTransaction) && path === route) && !(isRecurring && path === route.split('?')[0]) && !(isDashboard && path === '/dashboard') && !(isRead && path === activeTutorial.steps[nextIndex].route) && !(activeTutorial.key === budgetTutorialKey && path === '/budgeting') && !navigate(isRead ? readRoutes.current[route] ?? route : destination)) return
    setImportTask(task)
    setBudgetTask(selectedBudget)
    setRecurringTask(selectedRecurring)
    setProfileTask(selectedProfile)
    setSetupTask(selectedSetup)
    setInvitationTask(selectedInvitation)
    setTransactionTask(selectedTransaction)
    setCategoryTask(selectedCategory)
    setProblemsTask(selectedProblem)
    setLifecycleTask(selectedLifecycle)
    setAnnualTask(selectedAnnual)
    setActiveStepIndex(nextIndex)
    await record(activeTutorial, 'InProgress', nextIndex)
  }, [activeTutorial, activeStepIndex, importTask, reportedPage, householdId, navigate, record, budgetTask, budgetPage, currentHousehold, path, readTask, readPage, dashboardPage, dashboardTask, recurringPage, recurringTask, profilePage, profileTask, setupPage, setupTask, invitationPage, invitationTask, transactionTask, transactionPage, categoryTask, rulePage, recoveryTask, recoveryPreview, problemsTask, lifecycleTask, annualPage, annualTask])

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
    (continueTask = false) => moveTo(activeTutorial?.key === recurringTutorialKey && activeStepIndex === 5 ? 8 : activeStepIndex + 1, false, continueTask ? 'task' : 'tutorials'),
    [activeTutorial, activeStepIndex, moveTo],
  )
  const back = useCallback(
    () => moveTo(activeTutorial?.key === importTutorialKey && activeStepIndex === 4 ? 0
      : activeTutorial?.key === importProblemsTutorialKey && (activeStepIndex === 4 || activeStepIndex === 6 && problemsTask?.mode === 'inspect') ? 0
      : activeTutorial?.key === categorizationTutorialKey && activeStepIndex === 8 && !categoryTask?.optionalRules ? 4
      : activeTutorial?.key === lifecycleTutorialKey && activeStepIndex === 6 && !lifecycleTask?.replaced ? lifecycleTask?.kept ? 1 : 3
      : activeTutorial?.key === annualTutorialKey && activeStepIndex === 8 && annualTask?.annualOnly ? 3
      : activeTutorial?.key === setupTutorialKey && activeStepIndex === 4 && setupTask?.section === 'categories' ? 0
      : activeTutorial?.key === setupTutorialKey && activeStepIndex === 6 && setupTask?.section === 'accounts' ? 3
      : activeTutorial?.key === recurringTutorialKey && activeStepIndex === 8 && !recurringTask?.monthly ? 5 : activeStepIndex - 1),
    [activeTutorial, activeStepIndex, moveTo, recurringTask, setupTask, categoryTask, problemsTask, lifecycleTask, annualTask],
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
      if (activeStepIndex === activeTutorial.steps.length - 1) void moveTo(activeTutorial.steps.length, false, destination === 'budget' ? 'task' : 'tutorials')
    },
    stepOverride: budgetTutorialStepOverride(activeStepIndex, budgetPage?.value ?? null),
    restart: () => { void start(budgetTutorialKey) },
    returnToTask: () => {
      if (!budgetTask || budgetTask.householdId === householdId) navigate(budgetTutorialRoute(budgetTask))
    },
  } : undefined, [activeTutorial, activeStepIndex, budgetTask, householdId, currentHousehold?.role, path, budgetPage, moveTo, start, navigate])

  const readGuide = useMemo(() => activeTutorial?.presentation === 'read-companion' ? {
    ...readTutorialGate(householdId, currentHousehold?.role, readTask, readPage?.value ?? null, path,
      activeTutorial.steps[activeStepIndex].route,
      activeTutorial.steps[activeStepIndex].advance === 'click' && path === activeTutorial.steps[activeStepIndex + 1]?.route),
    canBack: activeStepIndex > 0,
    restart: () => { void start(activeTutorial.key) },
    returnToTask: () => {
      if (!readTask || readTask.householdId === householdId) {
        const route = activeTutorial.steps[activeStepIndex].route
        navigate(readRoutes.current[route] ?? route)
      }
    },
  } : undefined, [activeTutorial, activeStepIndex, householdId, currentHousehold?.role, readTask, readPage, path, start, navigate])

  const dashboardGuide = useMemo(() => activeTutorial?.key === dashboardTutorialKey ? {
    ...dashboardTutorialGate(activeStepIndex, householdId, currentHousehold?.role, dashboardTask, path === '/dashboard' ? dashboardPage?.value ?? null : null),
    canBack: activeStepIndex > 0 && !dashboardPage?.value.busy,
    restart: () => { void start(dashboardTutorialKey) },
    returnToTask: () => { if (!dashboardTask || dashboardTask.householdId === householdId) navigate('/dashboard') },
  } : undefined, [activeTutorial, activeStepIndex, householdId, currentHousehold?.role, dashboardTask, dashboardPage, path, start, navigate])

  const recurringGuide = useMemo(() => activeTutorial?.key === recurringTutorialKey ? {
    ...recurringTutorialGate(activeStepIndex, householdId, currentHousehold?.role, recurringTask,
      path === '/budgeting/recurring-expenses' ? recurringPage?.value ?? null : null, path === '/budgeting' ? budgetPage?.value ?? null : null),
    canBack: activeStepIndex > 0 && !recurringPage?.value.busy && !budgetPage?.value.busy,
    selection: recurringTask?.selection, expenseId: recurringTask?.expenseId,
    canBuildMonthly: currentHousehold?.role !== 'Viewer',
    buildMonthly: () => { if (activeStepIndex === 5) void moveTo(6) },
    restart: () => { void start(recurringTutorialKey) },
    returnToTask: () => { if (!recurringTask || recurringTask.householdId === householdId) navigate(recurringTutorialRoute(activeStepIndex, recurringTask)) },
    stepOverride: activeStepIndex === 8 && recurringTask?.monthly ? {
      targetId: 'monthly-budget-page-title', title: 'Your monthly plan is ready to review',
      body: 'Your budget is loaded. Check amounts and status before making further changes. Continue budgeting stays here.' } : undefined,
  } : undefined, [activeTutorial, activeStepIndex, householdId, currentHousehold?.role, recurringTask, recurringPage, budgetPage, path, moveTo, start, navigate])

  const profileGuide = useMemo(() => activeTutorial?.key === profileTutorialKey ? {
    ...profileTutorialGate(activeStepIndex, householdId, currentHousehold?.role, profileTask, profilePage?.value ?? null),
    canBack: activeStepIndex > 0 && !profilePage?.value.busy,
    selection: profileTask?.selection, profileId: profileTask?.profileId,
    restart: () => { void start(profileTutorialKey) },
    returnToTask: () => { if (!profileTask || profileTask.householdId === householdId) navigate(activeStepIndex < 5 ? '/settings/import-profiles' : '/import') },
    startImport: () => {
      if (activeStepIndex === 6 && profileTutorialGate(activeStepIndex, householdId, currentHousehold?.role, profileTask, profilePage?.value ?? null).canNext) {
        const expectedRevision = revision.current + 1
        void moveTo(7, false, 'task').then(() => { if (revision.current === expectedRevision && currentSession.current.active) return start(importTutorialKey) })
      }
    },
    stepOverride: activeStepIndex === 4 && profilePage?.value.page === 'profiles' && profilePage.value.profileId && !profilePage.value.editing && !profilePage.value.dirty ? {
      targetId: 'profile-tour-selected', title: 'Saved mapping ready',
      body: 'This mapping is saved. Continue to select it for import. Download template is optional; it does not upload anything.' }
      : activeStepIndex > 0 && activeStepIndex < 5 && profilePage?.value.page === 'profiles' && !profilePage.value.canEdit ? {
      targetId: 'profile-tour-selected', title: activeStepIndex === 4 ? 'Use the saved mapping' : 'Inspect the shared mapping',
      body: activeStepIndex === 4 ? 'Your role cannot edit shared profiles. This active mapping is already saved; nothing needs changing. Continue to choose it for CSV or Excel.'
        : 'Open Mapping details on the selected profile. Check headers, amount layout, signs and parsing. Your role can use this mapping, but only an Owner or Admin can change it.' } : undefined,
  } : undefined, [activeTutorial, activeStepIndex, householdId, currentHousehold?.role, profileTask, profilePage, navigate, start, moveTo])

  const setupGuide = useMemo(() => activeTutorial?.key === setupTutorialKey ? {
    ...setupTutorialGate(activeStepIndex, householdId, currentHousehold?.role, setupTask, setupPage?.value ?? null),
    canBack: activeStepIndex > 0 && !setupPage?.value.busy,
    selection: setupTask?.selection, accountId: setupTask?.accountId,
    continueLabel: setupTask?.section === 'accounts' ? 'Continue with accounts' : 'Continue with categories',
    choose: (section: SetupSection) => {
      if (activeStepIndex !== 0 || !householdId || !currentHousehold || !setupTutorialGate(0, householdId, currentHousehold.role, null, setupPage?.value ?? null).canNext) return
      const task = { householdId, role: currentHousehold.role, section }
      const index = section === 'categories' ? 4 : 1
      if (path !== setupTutorialRoute(index, task) && !navigate(setupTutorialRoute(index, task))) return
      setSetupTask(task); setActiveStepIndex(index); void record(activeTutorial, 'InProgress', index)
    },
    restart: () => { void start(setupTutorialKey) },
    returnToTask: () => { if (!setupTask || setupTask.householdId === householdId) navigate(setupTutorialRoute(activeStepIndex, setupTask)) },
    stepOverride: activeStepIndex === 3 && setupPage?.value.accountId && !setupPage.value.dirty ? {
      targetId: 'setup-tour-account-selected', title: 'Saved account available',
      body: 'Your chosen account is saved. Continue without adding another. Budget inclusion remains a separate transaction choice.' }
      : activeStepIndex === 6 && setupTask?.section === 'accounts' ? {
      targetId: 'accounts-page-title', title: 'Account setup reviewed',
      body: 'Your saved account is ready. Continue with accounts stays here; no other task starts automatically.' } : undefined,
  } : undefined, [activeTutorial, activeStepIndex, householdId, currentHousehold, setupTask, setupPage, path, navigate, record, start])

  const invitationGuide = useMemo(() => activeTutorial?.key === invitationTutorialKey ? {
    ...invitationTutorialGate(activeStepIndex, householdId, currentHousehold?.role, invitationTask, path === '/household' ? invitationPage?.value ?? null : null),
    canBack: activeStepIndex > 0 && !invitationPage?.value.busy,
    restart: () => { void start(invitationTutorialKey) },
    returnToTask: () => { if (!invitationTask || invitationTask.householdId === householdId) navigate('/household') },
    stepOverride: invitationStepOverride(activeStepIndex, invitationPage?.value ?? null),
  } : undefined, [activeTutorial, activeStepIndex, householdId, currentHousehold?.role, invitationTask, invitationPage, path, navigate, start])

  const transactionGuide = useMemo(() => {
    if (activeTutorial?.key !== transactionTutorialKey) return undefined
    const page = path === '/transactions' ? transactionPage?.value ?? null : null
    const gate = transactionTutorialGate(activeStepIndex, householdId, currentHousehold?.role, transactionTask, page)
    return {
      ...gate, canBack: activeStepIndex > 0 && !page?.busy,
      selection: transactionTask?.selection,
      restart: () => { void start(transactionTutorialKey) },
      returnToTask: () => { if (!transactionTask || transactionTask.householdId === householdId) navigate(transactionTask?.url ?? '/transactions') },
      keepUnchanged: () => {
        if (!gate.canKeepUnchanged || !transactionTask || !page || !activeTutorial) return
        setTransactionTask({ ...transactionTask, finish: 'kept' }); setActiveStepIndex(6); void record(activeTutorial, 'InProgress', 6)
      },
      reviewAnother: () => {
        if (activeStepIndex !== 7 || !gate.canNext || !transactionTask || !activeTutorial) return
        setTransactionTask({ householdId: transactionTask.householdId, role: transactionTask.role, url: transactionTask.url })
        setActiveStepIndex(2); void record(activeTutorial, 'InProgress', 2)
      },
      stepOverride: transactionStepOverride(activeStepIndex, transactionTask, page),
    }
  }, [activeTutorial, activeStepIndex, householdId, currentHousehold?.role, transactionTask, transactionPage, path, start, navigate, record])

  const categorizationGuide = useMemo(() => {
    if (activeTutorial?.key !== categorizationTutorialKey) return undefined
    const transaction = path === '/transactions' ? transactionPage?.value ?? null : null
    const imported = path === '/imports/review' ? reportedPage?.value ?? null : null
    const gate = categorizationGate(activeStepIndex, householdId, currentHousehold?.role, categoryTask, transaction, imported,
      path === '/settings/categorization-rules' ? rulePage?.value ?? null : null)
    const staged = categoryTask?.mode === 'staged'
    const targets = ['transaction-tour-count', 'import-file-picker', 'import-review-grid', 'import-bulk-budget-tools', 'import-review-grid', 'category-tour-picker', 'category-tour-save', 'import-rule-actions', 'import-review-summary']
    const bodies: Record<number, string> = {
      1: 'Choose the unfinished file you intend to categorize. Check account, currency and worksheet. Do not select another member’s private import.',
      2: 'Choose a category or subcategory on the staged rows. Correct rows can stay unchanged. Details contains optional row rules; Save & create rule saves that row first.',
      3: 'Use Save all corrections for intended edits. Changed approved rows return to Pending. Wait for saved rows to reload; errors are not success. No approval is required just for this tutorial.',
      4: 'A repeatable description can use a rule. Existing rules may already fit. You can finish here without making one.',
      7: 'Check the affected counts. Fill uncategorized fills empty categories or refines an overall category to its matching subcategory. Reapply can replace existing category choices; read its confirmation. Applying is optional, and zero matches is valid.',
      8: 'Saved categories checked. Continue review stays here; no rows are approved or turned into transactions automatically.',
    }
    return {
      ...gate, canBack: activeStepIndex > 0 && !transaction?.busy && !(imported?.busy) && !rulePage?.value.busy,
      selection: categoryTask?.selection, ruleId: categoryTask?.ruleId, ruleSelection: categoryTask?.ruleSelection,
      choose: (mode: 'posted' | 'staged') => {
        if (activeStepIndex !== 0 || !gate.canNext || !householdId || !currentHousehold) return
        const task = { householdId, role: currentHousehold.role, mode }
        const route = categoryTutorialRoute(1, task)
        if (path !== route && !navigate(route)) return
        setCategoryTask(task); setActiveStepIndex(1); void record(activeTutorial, 'InProgress', 1)
      },
      openRules: () => {
        if (activeStepIndex !== 4 || !gate.canNext || !categoryTask || !navigate('/settings/categorization-rules')) return
        setCategoryTask({ ...categoryTask, optionalRules: true, checkedOutcome: Boolean(transaction && transaction.outcomeRevision > (categoryTask.baselineRevision ?? 0)) }); setActiveStepIndex(5); void record(activeTutorial, 'InProgress', 5)
      },
      restart: () => { void start(categorizationTutorialKey) },
      returnToTask: () => { if (!categoryTask || categoryTask.householdId === householdId) navigate(categoryTutorialRoute(activeStepIndex, categoryTask)) },
      stepOverride: staged && activeStepIndex !== 0 && activeStepIndex !== 5 && activeStepIndex !== 6 ? { targetId: targets[activeStepIndex], body: bodies[activeStepIndex] }
        : activeStepIndex === 2 && transaction && !transaction.canEdit ? { targetId: 'transaction-task-record', title: 'Read-only category', body: 'Inspect the visible category. Your permission does not allow correcting this record; continue without making a change.' } : undefined,
    }
  }, [activeTutorial, activeStepIndex, householdId, currentHousehold, categoryTask, transactionPage, reportedPage, rulePage, path, navigate, record, start])

  const recoveryGuide = useMemo(() => {
    if (activeTutorial?.key !== importRecoveryTutorialKey) return undefined
    const page = path === '/imports/review' && reportedPage?.value.page === 'review' ? reportedPage.value : null
    const preview = recoveryPreview?.value ?? null
    const gate = recoveryGate(activeStepIndex, householdId, currentHousehold?.role, recoveryTask, page, preview)
    const editable = Boolean(page?.fresh && page.canEdit && !page.busy && !page.dirty)
    const canCorrect = editable && page?.status === 'ReadyForReview'
    const canUndo = editable && page?.status === 'Completed'
    let stepOverride: { title?: string; body?: string; targetId?: string } | undefined
    if ((activeStepIndex === 2 || activeStepIndex === 3) && recoveryTask?.action === 'discard') stepOverride = {
      targetId: 'import-discard-action', title: activeStepIndex === 2 ? 'Discard loses staged work' : 'Discard only if intended',
      body: 'Discard permanently removes this unfinished file’s staged rows and decisions—not official transactions. Use Discard import on the page and read its confirmation, or keep the file unchanged. This is not Undo.' }
    if ((activeStepIndex === 2 || activeStepIndex === 3) && recoveryTask?.action === 'undo') stepOverride = page?.status === 'Reversed'
      ? { targetId: 'import-recovery-result', title: 'Undo confirmed', body: 'The saved status is Undone. Do not repeat the command. Continue to verify retained history and totals.' }
      : { targetId: activeStepIndex === 2 ? 'import-undo-preview' : 'import-undo-controls', title: activeStepIndex === 2 ? 'Preview whole-batch undo' : preview?.canReverse ? 'Confirm only if intended' : 'Blocked—keep this batch',
        body: activeStepIndex === 2 ? 'Open Preview undo. It only reads eligibility. Edited, voided, referenced, missing or mismatched rows can block the entire batch; never override those checks.'
          : 'Eligible Undo voids the entire linked batch, removes it from active totals and keeps history. Read the affected count and confirm only on the page. If blocked or not intended, keep it unchanged; never delete rows as a workaround.' }
    if (activeStepIndex === 4 && recoveryTask?.kept) stepOverride = { targetId: 'import-recovery-result', title: 'Kept unchanged', body: 'No discard or undo was required. Your saved import stays as it was. You may leave it unchanged and return to normal review.' }
    if ((activeStepIndex === 3 || activeStepIndex === 4) && recoveryTask?.action === 'discard' && page?.discardedImportId === recoveryTask.importId) stepOverride = { targetId: 'import-recovery-result', title: 'Staged discard confirmed', body: 'The server confirmed the staged import was discarded. That staging cannot be restored. No official transaction was removed. A corrected file must start as a new reviewed import.' }
    if (activeStepIndex === 1 && page?.status === 'Reversed') stepOverride = { targetId: 'import-review-summary', title: 'Already undone', body: 'This batch is already undone. Review retained history and totals; do not send another Undo. Any corrected file starts as a new staged import.' }
    return {
      ...gate, canBack: activeStepIndex > 0 && !page?.busy && !preview?.busy, canCorrect, canDiscard: canCorrect, canUndo,
      choose: (action: ImportRecoveryAction) => {
        if (activeStepIndex !== 1 || !gate.canNext || !recoveryTask || action === 'correct' && !canCorrect || action === 'discard' && !canCorrect || action === 'undo' && !canUndo) return
        const index = action === 'inspect' ? 4 : 2
        setRecoveryTask({ ...recoveryTask, action, kept: action === 'inspect' }); setActiveStepIndex(index); void record(activeTutorial, 'InProgress', index)
      },
      keepUnchanged: () => { if (gate.canKeep && recoveryTask) { setRecoveryTask({ ...recoveryTask, kept: true }); setActiveStepIndex(4); void record(activeTutorial, 'InProgress', 4) } },
      restart: () => { void start(importRecoveryTutorialKey) },
      returnToTask: () => { if (!recoveryTask || recoveryTask.householdId === householdId) navigate(recoveryTask?.action === 'discard' && page?.discardedImportId === recoveryTask.importId ? '/imports/review' : recoveryTask?.url ?? '/imports/review') },
      startNewImport: () => {
        if (activeStepIndex !== 5 || !gate.canNext) return
        const expectedRevision = revision.current + 1
        void moveTo(6, false, 'task').then(() => { if (revision.current === expectedRevision && currentSession.current.active) return start(importTutorialKey) })
      }, stepOverride,
    }
  }, [activeTutorial, activeStepIndex, householdId, currentHousehold?.role, recoveryTask, recoveryPreview, reportedPage, path, record, navigate, moveTo, start])

  const problemsGuide = useMemo(() => {
    if (activeTutorial?.key !== importProblemsTutorialKey) return undefined
    const page = path === '/import' || path === '/imports/review' ? reportedPage?.value ?? null : null
    const gate = problemsGate(activeStepIndex, householdId, currentHousehold?.role, problemsTask, page)
    const canInspectSaved = Boolean(activeStepIndex >= 1 && activeStepIndex <= 3 && problemsTask?.mode === 'upload' && problemsTask.householdId === householdId && problemsTask.role === currentHousehold?.role && page?.page === 'upload' && page.uncertainKind === 'upload' && !page.busy)
    return {
      ...gate, canBack: activeStepIndex > 0 && !page?.busy, canInspectSaved,
      choose: (mode: ImportProblemsTask['mode']) => {
        if (activeStepIndex !== 0 || !gate.canNext || !householdId || !currentHousehold) return
        const task = { householdId, role: currentHousehold.role, mode }, index = mode === 'upload' ? 1 : mode === 'staged' ? 4 : 6
        if (path !== problemsRoute(index, task) && !navigate(problemsRoute(index, task))) return
        setProblemsTask(task); setActiveStepIndex(index); void record(activeTutorial, 'InProgress', index)
      },
      inspectSavedImports: () => {
        if (!canInspectSaved || !problemsTask || !navigate('/imports/review')) return
        setProblemsTask({ householdId: problemsTask.householdId, role: problemsTask.role, mode: 'staged' }); setActiveStepIndex(4); void record(activeTutorial, 'InProgress', 4)
      },
      restart: () => { void start(importProblemsTutorialKey) },
      returnToTask: () => { if (!problemsTask || problemsTask.householdId === householdId) navigate(problemsRoute(activeStepIndex, problemsTask)) },
      stepOverride: problemsTask?.mode === 'inspect' ? { targetId: 'csv-import-page-title', title: 'No example problem needed', body: 'No upload or correction is required to review this guidance. Keep correct files unchanged. Continue stays on Import transactions; choose a real problem later if one occurs.' }
        : activeStepIndex >= 1 && activeStepIndex <= 3 && page?.page === 'upload' && page.stagedId ? { targetId: 'import-stage-result', title: 'Staging confirmed', body: 'The server confirmed staged rows, not official transactions. Continue to inspect their saved values and duplicate evidence. Do not upload again.' }
        : activeStepIndex === 5 && page?.page === 'review' && !page.canEdit ? { targetId: 'import-review-grid', title: 'Inspect with your permissions', body: 'Inspect visible validation and duplicate evidence. Your role cannot change this import. Ask a permitted reviewer; the tutorial does not grant edit or approval rights.' }
        : activeStepIndex === 6 && page?.page === 'review' ? { targetId: 'import-review-summary', title: 'Saved state checked', body: `${page.invalidRows ?? 0} invalid rows; ${page.duplicateRows ?? 0} possible duplicates. Possible does not mean confirmed. Pending decisions can stay pending; nothing is approved automatically.` } : undefined,
    }
  }, [activeTutorial, activeStepIndex, householdId, currentHousehold, problemsTask, reportedPage, path, navigate, record, start])

  const lifecycleGuide = useMemo(() => {
    if (activeTutorial?.key !== lifecycleTutorialKey) return undefined
    const budget = path === '/budgeting' ? budgetPage?.value ?? null : null
    const annual = path === '/budgeting/annual-targets' ? annualPage?.value ?? null : null
    const gate = lifecycleGate(activeStepIndex, householdId, currentHousehold?.role, lifecycleTask, budget, annual)
    const canReplace = activeStepIndex === 3 && gate.canNext && lifecycleTask?.mode === 'return' && budget?.status === 'Draft'
    let stepOverride: { title?: string; body?: string; targetId?: string } | undefined
    if (activeStepIndex === 2 && lifecycleTask?.mode === 'copy') stepOverride = { targetId: budget?.budgetId ? 'budget-tutorial-summary' : 'lifecycle-tour-copy',
      title: budget?.budgetId ? 'Destination already saved' : 'Copy only if intended', body: budget?.budgetId
        ? 'This destination has a saved budget. Inspect it; do not overwrite it or copy again. Later edits here do not change the source plan, annual targets or transactions.'
        : 'Check Budget to copy, then explicitly choose Copy selected month on the page. Only planned amounts and category detail copy into an independent Draft. The source and ledger stay unchanged.' }
    if (activeStepIndex === 2 && lifecycleTask?.mode === 'reopen') stepOverride = { targetId: budget?.status === 'Closed' ? 'lifecycle-tour-reopen' : 'budget-tutorial-summary',
      title: budget?.status === 'Closed' ? 'Reopen only if needed' : 'Already editable', body: budget?.status === 'Closed'
        ? 'Reopen budget makes this plan editable again. Read the page confirmation. Closing does not freeze transaction actuals. You can keep it Closed instead.'
        : 'This plan is already Draft or Active. Inspect the current state; do not repeat Reopen. No new plan or transaction is required.' }
    if (activeStepIndex === 2 && lifecycleTask?.mode === 'return') stepOverride = { targetId: budget?.status === 'Active' ? 'lifecycle-tour-return' : 'budget-tutorial-summary',
      title: budget?.status === 'Draft' ? 'Already Draft' : 'Return to Draft only if intended', body: budget?.status === 'Draft'
        ? 'This plan is already Draft. Returning again is unnecessary. Continue to inspect it; replacement is a later optional choice.'
        : 'Return to draft changes the plan’s state and allows later Draft replacement or deletion. It does not delete transactions or replace amounts now. Read the page confirmation, or keep it Active.' }
    if (activeStepIndex === 3 && lifecycleTask?.mode === 'return') stepOverride = { title: 'Draft checked—replacement is optional', body: 'Keep the current Draft amounts unless you actually need replacement. Replacement copies saved annual targets into this chosen Draft and may lose its old planned amounts. It is not rollback.' }
    if (activeStepIndex === 5 && lifecycleTask?.replaced) stepOverride = { title: 'Replacement already verified', body: 'This tutorial already checked the confirmed replacement. Continue without allocating again. Saved plan amounts still need ordinary review; old replaced values are not guaranteed recoverable.' }
    if (activeStepIndex === 6 && lifecycleTask?.kept) stepOverride = { title: 'Saved state kept', body: 'No further action ran. Earlier saved changes remain; Exit is not Undo. Continue budgeting stays here.' }
    return {
      ...gate, canBack: activeStepIndex > 0 && !budget?.busy && !annual?.busy, canReplace,
      annualSelection: lifecycleTask?.annual && lifecycleTask.scope ? { year: lifecycleTask.annual.year, startMonth: lifecycleTask.annual.startMonth, scope: lifecycleTask.scope } : undefined,
      choose: (mode: LifecycleMode) => {
        if (activeStepIndex !== 0 || !gate.canNext || !householdId || !currentHousehold) return
        setLifecycleTask({ householdId, role: currentHousehold.role, mode }); setActiveStepIndex(1); void record(activeTutorial, 'InProgress', 1)
      },
      keepUnchanged: () => {
        if (!gate.canKeep || !lifecycleTask || !navigate(lifecycleRoute(6, lifecycleTask))) return
        setLifecycleTask({ ...lifecycleTask, kept: true }); setActiveStepIndex(6); void record(activeTutorial, 'InProgress', 6)
      },
      openReplacement: () => {
        if (!canReplace || !lifecycleTask || !navigate('/budgeting/annual-targets')) return
        setLifecycleTask({ ...lifecycleTask, kept: false }); setActiveStepIndex(4); void record(activeTutorial, 'InProgress', 4)
      },
      restart: () => { void start(lifecycleTutorialKey) },
      returnToTask: () => { if (!lifecycleTask || lifecycleTask.householdId === householdId) navigate(lifecycleRoute(activeStepIndex, lifecycleTask)) },
      stepOverride,
    }
  }, [activeTutorial, activeStepIndex, householdId, currentHousehold, lifecycleTask, budgetPage, annualPage, path, navigate, record, start])

  const annualGuide = useMemo(() => {
    if (activeTutorial?.key !== annualTutorialKey) return undefined
    const annual = path === '/budgeting/annual-targets' ? annualPage?.value ?? null : null
    const budget = path === '/budgeting' ? budgetPage?.value ?? null : null
    const gate = annualBudgetGate(activeStepIndex, householdId, currentHousehold?.role, annualTask, annual, budget)
    return {
      ...gate, canBack: activeStepIndex > 0 && !annual?.busy && !budget?.busy,
      selection: annualTask ? { year: annualTask.year, startMonth: annualTask.startMonth, scope: annualTask.scope } : undefined,
      continueLabel: annualTask?.annualOnly ? 'Continue annual targets' : 'Continue budgeting',
      finishAnnual: () => {
        if (!gate.canFinishAnnual || !annualTask) return
        setAnnualTask({ ...annualTask, annualOnly: true, monthly: undefined }); setActiveStepIndex(8); void record(activeTutorial, 'InProgress', 8)
      },
      openMonthly: (year: number, month: number) => {
        if (!annual || !householdId || !currentHousehold || annual.householdId !== householdId || !annual.fresh || annual.busy || annual.dirty || annual.uncertain || !annual.canManage || !annual.planId || annual.replaceDrafts) return false
        if (activeStepIndex > 5 && !(activeStepIndex === 8 && annualTask?.annualOnly)) return false
        if (annualTask && (annualTask.householdId !== householdId || annualTask.role !== currentHousehold.role || annualTask.year !== annual.year || annualTask.startMonth !== annual.startMonth || annualTask.scope !== annual.scope || annualTask.planId && annualTask.planId !== annual.planId)) return false
        const chosen = annual.budgets.find(item => item.year === year && item.month === month)
        if (!chosen) return false
        const task: AnnualBudgetTask = { householdId, role: currentHousehold.role, year: annual.year, startMonth: annual.startMonth, scope: annual.scope,
          planId: annual.planId, monthly: { year, month, budgetId: chosen.id } }
        if (!navigate(annualBudgetRoute(6, task))) return false
        setAnnualTask(task); setActiveStepIndex(6); void record(activeTutorial, 'InProgress', 6); return true
      },
      restart: () => { void start(annualTutorialKey) },
      returnToTask: () => { if (!annualTask || annualTask.householdId === householdId) navigate(annualBudgetRoute(activeStepIndex, annualTask)) },
      stepOverride: annualTask?.annualOnly ? { targetId: 'annual-tour-title', title: 'Annual targets checked', body: 'Continue annual targets stays here. No monthly allocation is required; monthly plans and actuals stay independent.' }
        : activeStepIndex === 7 && budget?.status === 'Closed' ? { targetId: 'budget-tutorial-summary', title: 'Closed month—inspect without editing', body: 'This month is Closed and read-only. Check its current plan and actuals without reopening it for practice. Closing does not freeze later transaction corrections. Continue without saving or activating.' } : undefined,
    }
  }, [activeTutorial, activeStepIndex, householdId, currentHousehold, annualTask, annualPage, budgetPage, path, navigate, record, start])

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
    readGuide,
    dashboardGuide,
    recurringGuide,
    profileGuide,
    setupGuide,
    invitationGuide,
    transactionGuide,
    categorizationGuide,
    recoveryGuide,
    problemsGuide,
    lifecycleGuide,
    annualGuide,
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
    readGuide,
    dashboardGuide,
    recurringGuide,
    profileGuide,
    setupGuide,
    invitationGuide,
    transactionGuide,
    categorizationGuide,
    recoveryGuide,
    problemsGuide,
    lifecycleGuide,
    annualGuide,
  ])

  return (
    <TutorialContext.Provider value={value}>
      <BudgetTutorialPageContext.Provider value={publishBudgetPage}>
        <ReadTutorialPageContext.Provider value={publishReadPage}>
          <DashboardTutorialPageContext.Provider value={publishDashboardPage}>
            <RecurringTutorialPageContext.Provider value={publishRecurringPage}>
            <ProfileTutorialPageContext.Provider value={publishProfilePage}>
            <SetupTutorialPageContext.Provider value={publishSetupPage}>
            <InvitationTutorialPageContext.Provider value={publishInvitationPage}>
            <TransactionTutorialPageContext.Provider value={publishTransactionPage}>
            <RuleTutorialPageContext.Provider value={publishRulePage}>
            <RecoveryPreviewContext.Provider value={publishRecoveryPreview}>
            <AnnualTutorialPageContext.Provider value={publishAnnualPage}>
            <ImportTutorialPageContext.Provider value={publishImportPage}>{children}</ImportTutorialPageContext.Provider>
            </AnnualTutorialPageContext.Provider>
            </RecoveryPreviewContext.Provider>
            </RuleTutorialPageContext.Provider>
            </TransactionTutorialPageContext.Provider>
            </InvitationTutorialPageContext.Provider>
            </SetupTutorialPageContext.Provider>
            </ProfileTutorialPageContext.Provider>
            </RecurringTutorialPageContext.Provider>
          </DashboardTutorialPageContext.Provider>
        </ReadTutorialPageContext.Provider>
      </BudgetTutorialPageContext.Provider>
      <TutorialOverlay />
    </TutorialContext.Provider>
  )
}
