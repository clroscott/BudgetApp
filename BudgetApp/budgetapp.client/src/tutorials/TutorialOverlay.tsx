import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTutorials } from './useTutorials'
import { isInternalNavigation } from './tutorialTargets'
import { useTutorialTarget } from './useTutorialTarget'
import { useTutorialFocus } from './useTutorialFocus'

export function TutorialOverlay() {
  const { activeTutorial, activeStepIndex, back, exit, next, error } = useTutorials()
  const step = activeTutorial?.steps[activeStepIndex]
  const { target, rect, phase, retry } = useTutorialTarget(step, activeTutorial?.kind)
  const layerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const descriptionId = useId()
  const [cardHeight, setCardHeight] = useState(300)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const focusTarget = useTutorialFocus({ active: !!activeTutorial, step, kind: activeTutorial?.kind,
    target, layerRef, headingRef, descriptionId, exit })

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
  }, [step, phase, error])

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
  const cardWidth = Math.max(0, Math.min(360, viewport.width - 32))
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

  return (
    <div className="tutorial-layer" ref={layerRef}>
      {rect ? <div aria-hidden="true">
        <div className="tutorial-blocker" style={{ inset: `0 0 ${viewport.height - rect.top}px 0` }} />
        <div className="tutorial-blocker" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
        <div className="tutorial-blocker" style={{ top: rect.top, left: rect.right, right: 0, height: rect.height }} />
        <div className="tutorial-blocker" style={{ top: rect.bottom, right: 0, bottom: 0, left: 0 }} />
        <div className="tutorial-spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      </div> : <div aria-hidden="true" className="tutorial-blocker tutorial-blocker-full" />}
      {/* A region, not an aria-modal dialog: the highlighted page control is also interactive. */}
      <section className="tutorial-coach-card" ref={cardRef} role="region" aria-label={`${activeTutorial.title} tutorial controls`}
        aria-describedby={descriptionId} style={{ top: cardTop, left: cardLeft, width: cardWidth, maxHeight: availableHeight } as CSSProperties}>
        <div className="tutorial-coach-progress">
          <span>Step {activeStepIndex + 1} of {activeTutorial.steps.length}</span>
          <button type="button" className="text-button" onClick={() => void exit()}>Exit tutorial</button>
        </div>
        <h2 ref={headingRef} tabIndex={-1}>{step.title}</h2>
        <p id={descriptionId}>{step.body}</p>
        {error && <p className="tutorial-recovery" role="alert">Your tutorial progress could not be saved or loaded. You can still continue or exit. {error}</p>}
        <div className="tutorial-recovery" role="status" aria-live="polite" aria-atomic="true">
          {phase === 'waiting' && <p>Waiting for the highlighted area to become available…</p>}
          {phase === 'unavailable' && <p>This area is not available. It may be hidden, still loading, or unavailable to your account. Retry after it is available{canSkip ? ', skip this step,' : ''} or exit the tutorial. Retrying does not click controls or save page data.</p>}
          {phase === 'ready' && step.advance === 'click' && <p>Select the highlighted control to continue. You can reach it with Tab or the button below.</p>}
        </div>
        {phase === 'ready' && <button type="button" className="secondary-button tutorial-target-focus" onClick={focusTarget}>
          {step.advance === 'click' ? 'Go to highlighted control' : 'Read highlighted area'}
        </button>}
        <div className="tutorial-coach-actions">
          <button className="secondary-button" type="button" disabled={activeStepIndex === 0} onClick={() => void back()}>Back</button>
          {phase === 'unavailable' && <>
            <button type="button" className="secondary-button" onClick={retry}>Retry target</button>
            {canSkip && <button type="button" onClick={() => void next()}>Skip step</button>}
          </>}
          {phase === 'ready' && step.advance === 'next' && <button type="button" onClick={() => void next()}>
            {activeStepIndex === activeTutorial.steps.length - 1 ? 'Finish' : 'Next'}
          </button>}
        </div>
      </section>
    </div>
  )
}
