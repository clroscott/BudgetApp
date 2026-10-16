import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTutorials } from './useTutorials'
import { isInternalNavigation } from './tutorialTargets'
import { useTutorialTarget } from './useTutorialTarget'
import { useTutorialFocus } from './useTutorialFocus'
import { createPortal } from 'react-dom'
import { useTutorialHost } from './useTutorialHost'
import { useTutorialPageError } from './useTutorialPageError'

export function TutorialOverlay() {
  const { activeTutorial, activeStepIndex, back, exit, next, error, importGuide } = useTutorials()
  const guided = Boolean(importGuide)
  const host = useTutorialHost(guided)
  const pageError = useTutorialPageError(host)
  const definitionStep = activeTutorial?.steps[activeStepIndex]
  const step = useMemo(() => guided && definitionStep && importGuide?.nextLabel === 'Verify completed import'
    ? { ...definitionStep, targetId: 'import-completion-summary', fallbackTargetIds: undefined } : definitionStep,
  [guided, definitionStep, importGuide?.nextLabel])
  const { target, rect, phase, retry } = useTutorialTarget(step, activeTutorial?.kind, !guided, pageError)
  const layerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const descriptionId = useId()
  const [cardHeight, setCardHeight] = useState(300)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const focusTarget = useTutorialFocus({ active: !!activeTutorial, step, kind: activeTutorial?.kind,
    target, layerRef, headingRef, descriptionId, exit, modeless: guided, host })

  useEffect(() => {
    if (!guided || !target) return
    const previousMargin = target.style.scrollMarginTop
    const headerBottom = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128
    target.style.scrollMarginTop = `${Math.max(16, headerBottom + 16)}px`
    target.classList.add('tutorial-task-target')
    target.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' })
    return () => {
      target.classList.remove('tutorial-task-target')
      target.style.scrollMarginTop = previousMargin
    }
  }, [guided, target, step, viewport.width, viewport.height])

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
  }, [step, phase, error, importGuide?.message])

  useEffect(() => {
    if (!target || step?.advance !== 'click') return
    let timer: number | undefined
    const advance = (event: MouseEvent) => {
      if (timer !== undefined || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const destination = isInternalNavigation(target) ? new URL((target as HTMLAnchorElement).href) : null
      timer = window.setTimeout(() => {
        timer = undefined
        // AppLink prevents the default even when successful. Check the route instead:
        // a canceled unsaved-change prompt must not advance or prompt a second time.
        if (destination && destination.pathname + destination.search !== window.location.pathname + window.location.search) return
        void next()
      }, 0)
    }
    target.addEventListener('click', advance)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      target.removeEventListener('click', advance)
    }
  }, [next, step, target])

  if (!activeTutorial || !step) return null
  const canSkip = activeTutorial.kind === 'LearnOnly' || step.advance === 'next' && step.canSkipWhenUnavailable
  const cardWidth = Math.max(0, Math.min(guided ? 440 : 360, viewport.width - 32))
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
  if (guided) {
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
    <div className={`tutorial-layer${guided ? ' tutorial-task-guide' : ''}${pageError ? ' needs-attention' : ''}`} ref={layerRef}>
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
        {guided && <progress className="tutorial-task-progress" aria-label="Tutorial progress" value={activeStepIndex + 1} max={activeTutorial.steps.length} />}
        <h2 ref={headingRef} tabIndex={-1}>{step.title}</h2>
        {pageError && <span className="tutorial-attention-label">Needs attention</span>}
        <p id={descriptionId}>{pageError ? 'Check the error on the page and fix it before continuing. Your tutorial stays on this step.' : step.body}</p>
        {error && <p className="tutorial-recovery" role="alert">{guided ? 'Progress couldn’t save. You can still continue or exit.' : `Your tutorial progress could not be saved or loaded. You can still continue or exit. ${error}`}</p>}
        <div className="tutorial-recovery" role="status" aria-live="polite" aria-atomic="true">
          {!pageError && importGuide?.message && <p>{importGuide.message}</p>}
          {phase === 'waiting' && <p>{guided ? 'Finding your next step…' : 'Waiting for the highlighted area to become available…'}</p>}
          {phase === 'unavailable' && <p>{guided ? 'Can’t find this area. Retry, return to the task, or exit.' : `This area is not available. It may be hidden, still loading, or unavailable to your account. Retry after it is available${canSkip ? ', skip this step,' : ''} or exit the tutorial. Retrying does not click controls or save page data.`}</p>}
          {phase === 'ready' && step.advance === 'click' && <p>Select the highlighted control to continue. You can reach it with Tab or the button below.</p>}
        </div>
        {phase === 'ready' && (!guided || activeStepIndex > 0 || !!pageError) && <button type="button" className={`${guided ? 'text-button' : 'secondary-button'} tutorial-target-focus`} onClick={focusTarget}>
          {pageError ? 'Show error' : guided ? 'Show me' : step.advance === 'click' ? 'Go to highlighted control' : 'Read highlighted area'}
        </button>}
        <div className="tutorial-coach-actions">
          {(!guided || activeStepIndex > 0) && <button className="secondary-button" type="button" disabled={importGuide ? !importGuide.canBack : activeStepIndex === 0} onClick={() => void back()}>Back</button>}
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
          {!guided && phase === 'ready' && step.advance === 'next' && <button type="button" onClick={() => void next()}>
            {activeStepIndex === activeTutorial.steps.length - 1 ? 'Finish' : 'Next'}
          </button>}
        </div>
        {guided && <details className="tutorial-more-details" key={activeStepIndex}>
          <summary>More details</summary>
          {step.details && <p>{step.details}</p>}
          <button type="button" className="text-button" onClick={importGuide?.restart}>Restart task selection</button>
        </details>}
      </section>
    </div>
  )
  return guided ? <>{createPortal(content, document.body)}{host && createPortal(
    <div aria-hidden="true" style={{ height: Math.min(cardHeight, availableHeight) + 32 }} />, host,
  )}</> : content
}
