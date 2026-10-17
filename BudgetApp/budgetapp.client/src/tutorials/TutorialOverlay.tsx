import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTutorials } from './useTutorials'
import { isInternalNavigation } from './tutorialTargets'
import { useTutorialTarget } from './useTutorialTarget'
import { useTutorialFocus } from './useTutorialFocus'
import { createPortal } from 'react-dom'
import { useTutorialHost } from './useTutorialHost'
import { useTutorialPageError } from './useTutorialPageError'

export function TutorialOverlay() {
  const { activeTutorial, activeStepIndex, back, exit, next, error, importGuide, budgetGuide, readGuide, dashboardGuide, recurringGuide, profileGuide, setupGuide, invitationGuide, transactionGuide, categorizationGuide, recoveryGuide, problemsGuide, lifecycleGuide, annualGuide } = useTutorials()
  const taskGuide = importGuide ?? budgetGuide ?? readGuide ?? dashboardGuide ?? recurringGuide ?? profileGuide ?? setupGuide ?? invitationGuide ?? transactionGuide ?? categorizationGuide ?? recoveryGuide ?? problemsGuide ?? lifecycleGuide ?? annualGuide
  const guided = Boolean(importGuide ?? budgetGuide ?? dashboardGuide ?? recurringGuide ?? profileGuide ?? setupGuide ?? invitationGuide ?? transactionGuide ?? categorizationGuide ?? recoveryGuide ?? problemsGuide ?? lifecycleGuide ?? annualGuide)
  const companion = guided || Boolean(readGuide)
  const host = useTutorialHost(companion, annualGuide ? 'annual-tutorial-guide-host' : lifecycleGuide ? 'lifecycle-tutorial-guide-host' : problemsGuide ? 'import-problems-guide-host' : recoveryGuide ? 'import-recovery-guide-host' : categorizationGuide ? 'categorization-tutorial-guide-host' : transactionGuide ? 'transaction-tutorial-guide-host' : invitationGuide ? 'invitation-tutorial-guide-host' : setupGuide ? 'setup-tutorial-guide-host' : profileGuide ? (activeStepIndex < 5 ? 'profile-tutorial-guide-host' : 'import-tutorial-guide-host') : recurringGuide ? (activeStepIndex === 6 || activeStepIndex === 7 || recurringGuide.stepOverride ? 'budget-tutorial-guide-host' : 'recurring-tutorial-guide-host') : dashboardGuide ? 'dashboard-tutorial-guide-host' : readGuide ? 'read-tutorial-guide-host' : budgetGuide ? 'budget-tutorial-guide-host' : undefined)
  const pageError = useTutorialPageError(host, Boolean(problemsGuide))
  const definitionStep = activeTutorial?.steps[activeStepIndex]
  const override = budgetGuide?.stepOverride ?? recurringGuide?.stepOverride ?? profileGuide?.stepOverride ?? setupGuide?.stepOverride ?? invitationGuide?.stepOverride ?? transactionGuide?.stepOverride ?? categorizationGuide?.stepOverride ?? recoveryGuide?.stepOverride ?? problemsGuide?.stepOverride ?? lifecycleGuide?.stepOverride ?? annualGuide?.stepOverride
  const overrideBody = override?.body
  const overrideTitle = override?.title
  const overrideTarget = override?.targetId
  const step = useMemo(() => definitionStep && (overrideBody !== undefined || overrideTitle !== undefined || overrideTarget !== undefined)
    ? { ...definitionStep, body: overrideBody ?? definitionStep.body, title: overrideTitle ?? definitionStep.title, targetId: overrideTarget ?? definitionStep.targetId }
    : guided && definitionStep && importGuide?.nextLabel === 'Verify completed import'
      ? { ...definitionStep, targetId: 'import-completion-summary', fallbackTargetIds: undefined } : definitionStep,
  [guided, definitionStep, importGuide?.nextLabel, overrideBody, overrideTitle, overrideTarget])
  const { target, rect, phase, retry } = useTutorialTarget(step, activeTutorial?.kind, !companion, pageError)
  const layerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0
  }, [activeTutorial?.key, activeStepIndex])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const nextRef = useRef(next)
  useLayoutEffect(() => { nextRef.current = next }, [next])
  const clickContext = useRef({ key: activeTutorial?.key, index: activeStepIndex })
  useLayoutEffect(() => { clickContext.current = { key: activeTutorial?.key, index: activeStepIndex } }, [activeTutorial?.key, activeStepIndex])
  const descriptionId = useId()
  const [cardHeight, setCardHeight] = useState(300)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const focusTarget = useTutorialFocus({ active: !!activeTutorial, step, kind: activeTutorial?.kind,
    target, layerRef, headingRef, descriptionId, exit, modeless: guided, host })

  useEffect(() => {
    if (!companion || !target) return
    const previousMargin = target.style.scrollMarginTop
    const headerBottom = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128
    target.style.scrollMarginTop = `${Math.max(16, headerBottom + 16)}px`
    target.classList.add('tutorial-task-target')
    target.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' })
    return () => {
      target.classList.remove('tutorial-task-target')
      target.style.scrollMarginTop = previousMargin
    }
  }, [companion, target, step, viewport.width, viewport.height])

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const measure = () => { if (card.offsetHeight) setCardHeight(card.offsetHeight) }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(card)
    return () => observer?.disconnect()
  }, [step, phase, error, taskGuide?.message])

  useEffect(() => {
    if (!target || step?.advance !== 'click') return
    let timer: number | undefined
    const advance = (event: MouseEvent) => {
      if (timer !== undefined || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const destination = isInternalNavigation(target) ? new URL((target as HTMLAnchorElement).href) : null
      const intent = clickContext.current
      timer = window.setTimeout(() => {
        timer = undefined
        if (clickContext.current.key !== intent.key || clickContext.current.index !== intent.index) return
        // AppLink prevents the default even when successful. Check the route instead:
        // a canceled unsaved-change prompt must not advance or prompt a second time.
        if (destination && destination.pathname + destination.search !== window.location.pathname + window.location.search) return
        void nextRef.current()
      }, 0)
    }
    target.addEventListener('click', advance)
    return () => {
      const destination = isInternalNavigation(target) ? new URL((target as HTMLAnchorElement).href) : null
      // A report link disappears on successful navigation. Keep that one queued
      // observation; its context token still cancels Exit/replay/step changes.
      const accepted = destination && destination.pathname + destination.search === window.location.pathname + window.location.search
      if (timer !== undefined && !accepted) window.clearTimeout(timer)
      target.removeEventListener('click', advance)
    }
  }, [step, target])

  if (!activeTutorial || !step) return null
  const canSkip = activeTutorial.kind === 'LearnOnly' || step.advance === 'next' && step.canSkipWhenUnavailable
  const cardWidth = Math.max(0, Math.min(companion ? 440 : 360, viewport.width - 32))
  let cardLeft = rect ? Math.max(16, Math.min(viewport.width - cardWidth - 16, rect.left + rect.width / 2 - cardWidth / 2))
    : Math.max(16, (viewport.width - cardWidth) / 2)
  let availableHeight = Math.max(80, viewport.height - 32)
  let cardTop = Math.max(16, (viewport.height - Math.min(cardHeight, availableHeight)) / 2)
  if (rect) {
    const below = viewport.height - rect.bottom - 32
    const above = rect.top - 32
    if (below >= cardHeight || below >= above) {
      cardTop = rect.bottom + 16
      availableHeight = Math.max(80, below)
    } else {
      availableHeight = Math.max(80, above)
      cardTop = Math.max(16, rect.top - Math.min(cardHeight, availableHeight) - 16)
    }
    // Tall highlighted areas may leave more room to either side than above/below.
    if (Math.max(above, below) < 160 && viewport.width - rect.right >= cardWidth + 32) {
      cardLeft = rect.right + 16
      availableHeight = Math.max(80, viewport.height - 32)
      cardTop = 16
    }
    cardTop = Math.max(16, Math.min(cardTop, viewport.height - Math.min(cardHeight, availableHeight) - 16))
  }
  if (companion) {
    // A predictable bottom dock, with real scroll space after the task, keeps
    // the prompt out of the highlighted controls even on a narrow screen.
    availableHeight = Math.max(80, Math.min(viewport.height * 0.48, viewport.height - 32))
    cardTop = viewport.height - Math.min(cardHeight, availableHeight) - 16
    cardLeft = (viewport.width - cardWidth) / 2
  }
  // Keep the ring tied to the actual control. Cropping it at the coach's top
  // cut through unrelated buttons as the page scrolled past the fixed dock.
  const visibleSpotlight = rect

  const content = (
    <div className={`tutorial-layer${companion ? ' tutorial-task-guide' : ''}${pageError ? ' needs-attention' : ''}`} ref={layerRef}>
      {(visibleSpotlight ? <div aria-hidden="true">
        {!pageError && <>
        <div className="tutorial-blocker" style={{ inset: `0 0 ${viewport.height - visibleSpotlight.top}px 0` }} />
        <div className="tutorial-blocker" style={{ top: visibleSpotlight.top, left: 0, width: visibleSpotlight.left, height: visibleSpotlight.height }} />
        <div className="tutorial-blocker" style={{ top: visibleSpotlight.top, left: visibleSpotlight.right, right: 0, height: visibleSpotlight.height }} />
        <div className="tutorial-blocker" style={{ top: visibleSpotlight.bottom, right: 0, bottom: 0, left: 0 }} />
        </>}
        <div className="tutorial-spotlight" style={{ top: visibleSpotlight.top, left: visibleSpotlight.left, width: visibleSpotlight.width, height: visibleSpotlight.height }} />
      </div> : !pageError && <div aria-hidden="true" className="tutorial-blocker tutorial-blocker-full" />)}
      {/* A region, not an aria-modal dialog: the highlighted page control is also interactive. */}
      <section className="tutorial-coach-card" ref={cardRef} role="region" aria-label={`${activeTutorial.title} tutorial controls`}
        aria-describedby={descriptionId} style={{ top: cardTop, left: cardLeft, width: cardWidth, maxHeight: availableHeight } as CSSProperties}>
        <div className="tutorial-coach-progress">
          <span>Step {activeStepIndex + 1} of {activeTutorial.steps.length}</span>
          <button type="button" className="text-button" onClick={() => void exit()}>Exit tutorial</button>
        </div>
        {companion && <progress className="tutorial-task-progress" aria-label="Tutorial progress" value={activeStepIndex + 1} max={activeTutorial.steps.length} />}
        <h2 ref={headingRef} tabIndex={-1}>{step.title}</h2>
        {pageError && <span className="tutorial-attention-label">Needs attention</span>}
        <p id={descriptionId}>{pageError ? 'Check the error on the page and fix it before continuing. Your tutorial stays on this step.' : step.body}</p>
        {error && <p className="tutorial-recovery" role="alert">{guided ? 'Progress couldn’t save. You can still continue or exit.' : `Your tutorial progress could not be saved or loaded. You can still continue or exit. ${error}`}</p>}
        <div className="tutorial-recovery" role="status" aria-live="polite" aria-atomic="true">
          {!pageError && taskGuide?.message && <p>{taskGuide.message}</p>}
          {phase === 'waiting' && <p>{guided ? 'Finding your next step…' : 'Waiting for the highlighted area to become available…'}</p>}
          {phase === 'unavailable' && <p>{guided ? 'Can’t find this area. Retry, return to the task, or exit.' : `This area is not available. It may be hidden, still loading, or unavailable to your account. Retry after it is available${canSkip ? ', skip this step,' : ''} or exit the tutorial. Retrying does not click controls or save page data.`}</p>}
          {phase === 'ready' && step.advance === 'click' && <p>Select the highlighted control to continue. You can reach it with Tab or the button below.</p>}
        </div>
        {phase === 'ready' && (!importGuide || activeStepIndex > 0 || !!pageError) && <button type="button" className={`${companion ? 'text-button' : 'secondary-button'} tutorial-target-focus`} onClick={focusTarget}>
          {pageError ? 'Show error' : companion ? 'Show me' : step.advance === 'click' ? 'Go to highlighted control' : 'Read highlighted area'}
        </button>}
        <div className="tutorial-coach-actions">
          {(!guided || activeStepIndex > 0) && <button className="secondary-button" type="button" disabled={taskGuide ? !taskGuide.canBack : activeStepIndex === 0} onClick={() => void back()}>Back</button>}
          {budgetGuide && <>
            {budgetGuide.canKeepDraft && <button type="button" className="secondary-button" disabled={phase !== 'ready' || !!pageError} onClick={budgetGuide.keepDraft}>Keep as draft</button>}
            {activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!budgetGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => budgetGuide.complete('tutorials')}>Return to tutorials</button>
              <button type="button" disabled={!budgetGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => budgetGuide.complete('budget')}>Continue budgeting</button>
            </> : <button type="button" disabled={!budgetGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{budgetGuide.nextLabel}</button>}
            {!host && <button type="button" className="secondary-button" onClick={budgetGuide.returnToTask}>Return to Monthly budget</button>}
          </>}
          {readGuide && <>
            {activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!readGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!readGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>{activeTutorial.continueLabel ?? 'Continue here'}</button>
            </> : step.advance !== 'click' && <button type="button" disabled={!readGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Next</button>}
            {!host && <button type="button" className="secondary-button" onClick={readGuide.returnToTask}>Return to task page</button>}
          </>}
          {dashboardGuide && <>
            {activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!dashboardGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!dashboardGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue to Dashboard</button>
            </> : <button type="button" disabled={!dashboardGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Next</button>}
            {!host && <button type="button" className="secondary-button" onClick={dashboardGuide.returnToTask}>Return to Dashboard</button>}
          </>}
          {recurringGuide && <>
            {activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!recurringGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!recurringGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>{recurringGuide.stepOverride ? 'Continue budgeting' : 'Continue recurring expenses'}</button>
            </> : <>
              {activeStepIndex === 5 && <button type="button" className="secondary-button" disabled={!recurringGuide.canBuildMonthly || !recurringGuide.canNext || phase !== 'ready' || !!pageError} onClick={recurringGuide.buildMonthly}>Build a monthly draft</button>}
              <button type="button" disabled={!recurringGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 0 ? 'Use this item' : activeStepIndex === 5 ? 'Finish here' : 'Next'}</button>
            </>}
            {!host && <button type="button" className="secondary-button" onClick={recurringGuide.returnToTask}>Return to task page</button>}
          </>}
          {profileGuide && <>
            {activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!profileGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!profileGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue importing</button>
            </> : <button type="button" disabled={!profileGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 0 ? 'Use this mapping' : 'Next'}</button>}
            {!host && <button type="button" className="secondary-button" onClick={profileGuide.returnToTask}>Return to task page</button>}
          </>}
          {setupGuide && <>
            {activeStepIndex === 0 ? <>
              {(['accounts', 'categories', 'both'] as const).map(section => <button key={section} type="button" disabled={!setupGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => setupGuide.choose(section)}>{section === 'both' ? 'Both' : section === 'accounts' ? 'Accounts' : 'Categories'}</button>)}
            </> : activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!setupGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!setupGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>{setupGuide.continueLabel}</button>
            </> : <button type="button" disabled={!setupGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 1 ? 'Use this account' : 'Next'}</button>}
            {!host && <button type="button" className="secondary-button" onClick={setupGuide.returnToTask}>Return to setup page</button>}
          </>}
          {annualGuide && <>
            {activeStepIndex === 8 ? <>
              <button type="button" className="secondary-button" disabled={!annualGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!annualGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>{annualGuide.continueLabel}</button>
            </> : activeStepIndex !== 5 && <button type="button" disabled={!annualGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 0 ? 'Use this annual plan' : 'Next'}</button>}
            {annualGuide.canFinishAnnual && <button type="button" className="secondary-button" disabled={phase !== 'ready' || !!pageError} onClick={annualGuide.finishAnnual}>Finish with annual targets only</button>}
            {!host && <button type="button" className="secondary-button" onClick={annualGuide.returnToTask}>Return to chosen plan</button>}
          </>}
          {lifecycleGuide && <>
            {activeStepIndex === 0 ? <>
              {(['copy', 'reopen', 'return'] as const).map(mode => <button key={mode} type="button" disabled={!lifecycleGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => lifecycleGuide.choose(mode)}>{mode === 'copy' ? 'Copy a budget' : mode === 'reopen' ? 'Reopen a Closed budget' : 'Return to Draft / replace'}</button>)}
            </> : activeStepIndex === 6 ? <>
              <button type="button" className="secondary-button" disabled={!lifecycleGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!lifecycleGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue budgeting</button>
            </> : <button type="button" disabled={!lifecycleGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 1 ? 'Use this month' : activeStepIndex === 3 ? 'Keep current amounts' : 'Next'}</button>}
            {lifecycleGuide.canReplace && <button type="button" className="secondary-button" disabled={phase !== 'ready' || !!pageError} onClick={lifecycleGuide.openReplacement}>Inspect Draft replacement</button>}
            {lifecycleGuide.canKeep && <button type="button" className="secondary-button" disabled={phase !== 'ready' || !!pageError} onClick={lifecycleGuide.keepUnchanged}>Keep checked saved state</button>}
            {!host && <button type="button" className="secondary-button" onClick={lifecycleGuide.returnToTask}>Return to chosen budget task</button>}
          </>}
          {problemsGuide && <>
            {activeStepIndex === 0 ? <>
              <button type="button" disabled={!problemsGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => problemsGuide.choose('upload')}>Upload or file settings</button>
              <button type="button" className="secondary-button" disabled={!problemsGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => problemsGuide.choose('staged')}>Staged rows or duplicates</button>
              <button type="button" className="secondary-button" disabled={!problemsGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => problemsGuide.choose('inspect')}>No current problem</button>
            </> : activeStepIndex === 6 ? <>
              <button type="button" className="secondary-button" disabled={!problemsGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!problemsGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue here</button>
            </> : <button type="button" disabled={!problemsGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 4 ? 'Use this import' : 'Next'}</button>}
            {problemsGuide.canInspectSaved && <button type="button" className="secondary-button" onClick={problemsGuide.inspectSavedImports}>Inspect saved imports</button>}
            {!host && <button type="button" className="secondary-button" onClick={problemsGuide.returnToTask}>Return to task page</button>}
          </>}
          {recoveryGuide && <>
            {activeStepIndex === 1 ? <>
              {recoveryGuide.canCorrect && <button type="button" disabled={phase !== 'ready' || !!pageError || !recoveryGuide.canNext} onClick={() => recoveryGuide.choose('correct')}>Correct staged rows</button>}
              {recoveryGuide.canDiscard && <button type="button" className="secondary-button" disabled={phase !== 'ready' || !!pageError || !recoveryGuide.canNext} onClick={() => recoveryGuide.choose('discard')}>Check staged discard</button>}
              {recoveryGuide.canUndo && <button type="button" disabled={phase !== 'ready' || !!pageError || !recoveryGuide.canNext} onClick={() => recoveryGuide.choose('undo')}>Check completed Undo</button>}
              <button type="button" className="secondary-button" disabled={!recoveryGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => recoveryGuide.choose('inspect')}>Review without changing</button>
            </> : activeStepIndex === 5 ? <>
              <button type="button" className="secondary-button" disabled={!recoveryGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!recoveryGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue import review</button>
            </> : <button type="button" disabled={!recoveryGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 0 ? 'Use this import' : 'Next'}</button>}
            {recoveryGuide.canKeep && <button type="button" className="secondary-button" disabled={phase !== 'ready' || !!pageError} onClick={recoveryGuide.keepUnchanged}>Keep unchanged</button>}
            {!host && <button type="button" className="secondary-button" onClick={recoveryGuide.returnToTask}>Return to selected import</button>}
          </>}
          {categorizationGuide && <>
            {activeStepIndex === 0 ? <>
              <button type="button" disabled={!categorizationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => categorizationGuide.choose('posted')}>Saved Transactions</button>
              <button type="button" disabled={!categorizationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => categorizationGuide.choose('staged')}>Staged import rows</button>
            </> : activeStepIndex === 8 ? <>
              <button type="button" className="secondary-button" disabled={!categorizationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!categorizationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue categorizing</button>
            </> : <button type="button" disabled={!categorizationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 4 ? 'Finish without a rule' : activeStepIndex === 1 ? 'Use this selection' : 'Next'}</button>}
            {activeStepIndex === 4 && <button type="button" className="secondary-button" disabled={!categorizationGuide.canNext || phase !== 'ready' || !!pageError} onClick={categorizationGuide.openRules}>Inspect or create a rule</button>}
            {!host && <button type="button" className="secondary-button" onClick={categorizationGuide.returnToTask}>Return to task page</button>}
          </>}
          {transactionGuide && <>
            {activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!transactionGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!transactionGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue with Transactions</button>
            </> : <button type="button" disabled={!transactionGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 2 ? 'Use this choice' : 'Next'}</button>}
            {transactionGuide.canKeepUnchanged && <button type="button" className="secondary-button" disabled={phase !== 'ready' || !!pageError} onClick={transactionGuide.keepUnchanged}>Keep unchanged</button>}
            {!host && <button type="button" className="secondary-button" onClick={transactionGuide.returnToTask}>Return to Transactions</button>}
          </>}
          {invitationGuide && <>
            {activeStepIndex === activeTutorial.steps.length - 1 ? <>
              <button type="button" className="secondary-button" disabled={!invitationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>Return to tutorials</button>
              <button type="button" disabled={!invitationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next(true)}>Continue with Household</button>
            </> : <button type="button" disabled={!invitationGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{activeStepIndex === 0 ? 'Use this choice' : 'Next'}</button>}
            {!host && <button type="button" className="secondary-button" onClick={invitationGuide.returnToTask}>Return to Household</button>}
          </>}
          {importGuide && <>
            {activeStepIndex === 0 ? <>
              <button type="button" disabled={!importGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => importGuide.choose('upload')}>New CSV/Excel upload</button>
              <button type="button" disabled={!importGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => importGuide.choose('existing')}>Continue an existing import</button>
            </> : <button type="button" disabled={!importGuide.canNext || phase !== 'ready' || !!pageError} onClick={() => void next()}>{importGuide.nextLabel}</button>}
            {!host && <button type="button" className="secondary-button" onClick={importGuide.returnToTask}>Return to task page</button>}
          </>}
          {phase === 'unavailable' && <>
            <button type="button" className="secondary-button" onClick={retry}>Retry target</button>
            {canSkip && <button type="button" onClick={() => void next()}>Skip step</button>}
          </>}
          {!companion && phase === 'ready' && step.advance === 'next' && <button type="button" onClick={() => void next()}>
            {activeStepIndex === activeTutorial.steps.length - 1 ? 'Finish' : 'Next'}
          </button>}
        </div>
        {companion && <details className="tutorial-more-details" key={activeStepIndex}>
          <summary>More details</summary>
          {step.details && <p>{step.details}</p>}
          {annualGuide && <button type="button" className="text-button" onClick={annualGuide.returnToTask}>Return to chosen plan</button>}
          {lifecycleGuide && <button type="button" className="text-button" onClick={lifecycleGuide.returnToTask}>Return to chosen budget task</button>}
          {recoveryGuide && <>
            <button type="button" className="text-button" onClick={recoveryGuide.returnToTask}>Return to selected import</button>
            {activeStepIndex === 5 && <button type="button" className="text-button" disabled={!recoveryGuide.canNext || !!pageError} onClick={recoveryGuide.startNewImport}>Start a new corrected import tutorial</button>}
          </>}
          {transactionGuide && <>
            <button type="button" className="text-button" onClick={transactionGuide.returnToTask}>Return to selected search</button>
            {activeStepIndex === 7 && <button type="button" className="text-button" disabled={!transactionGuide.canNext || !!pageError} onClick={transactionGuide.reviewAnother}>Review another transaction</button>}
          </>}
          {profileGuide && activeStepIndex === 6 && <button type="button" className="text-button" disabled={!profileGuide.canNext || !!pageError} onClick={profileGuide.startImport}>Start import tutorial</button>}
          <button type="button" className="text-button" onClick={taskGuide?.restart}>Restart task selection</button>
        </details>}
      </section>
    </div>
  )
  return companion ? <>{createPortal(content, document.body)}{host && createPortal(
    <div aria-hidden="true" style={{ height: Math.min(cardHeight, availableHeight) + 32 }} />, host,
  )}</> : content
}
