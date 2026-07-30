import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { useTutorials } from './useTutorials'

interface TargetRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

const padding = 8

export function TutorialOverlay() {
  const {
    activeTutorial,
    activeStepIndex,
    back,
    exit,
    next,
  } = useTutorials()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<TargetRect | null>(null)

  const step = activeTutorial?.steps[activeStepIndex]

  useEffect(() => {
    if (!step) {
      setTarget(null)
      return
    }

    let cancelled = false
    let observer: MutationObserver | null = null
    const findTarget = () => {
      if (step.targetId.startsWith('nav-')) {
        const menu = document.querySelector<HTMLElement>(
          '[data-tutorial-id="sidebar-menu"]',
        )
        if (menu?.getAttribute('aria-expanded') === 'false' &&
            window.matchMedia('(max-width: 760px)').matches) {
          menu.click()
        }
      }

      const element = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${step.targetId}"]`,
      )
      if (!element || cancelled) return false
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTarget(element)
      return true
    }

    if (!findTarget()) {
      observer = new MutationObserver(() => {
        if (findTarget()) observer?.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      cancelled = true
      observer?.disconnect()
      setTarget(null)
    }
  }, [step])

  useLayoutEffect(() => {
    if (!target) {
      setRect(null)
      return
    }

    const update = () => {
      const bounds = target.getBoundingClientRect()
      setRect({
        top: Math.max(0, bounds.top - padding),
        left: Math.max(0, bounds.left - padding),
        right: Math.min(window.innerWidth, bounds.right + padding),
        bottom: Math.min(window.innerHeight, bounds.bottom + padding),
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [target])

  useEffect(() => {
    if (!target || step?.advance !== 'click') return
    const advance = () => {
      window.setTimeout(() => void next(), 0)
    }
    target.addEventListener('click', advance, { once: true })
    return () => target.removeEventListener('click', advance)
  }, [next, step?.advance, target])

  useEffect(() => {
    if (!activeTutorial) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void exit()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeTutorial, exit])

  if (!activeTutorial || !step) return null

  const cardWidth = Math.min(360, window.innerWidth - 32)
  const cardLeft = rect
    ? Math.min(
        window.innerWidth - cardWidth - 16,
        Math.max(16, rect.left + rect.width / 2 - cardWidth / 2),
      )
    : Math.max(16, (window.innerWidth - cardWidth) / 2)
  const showAbove = rect ? rect.bottom + 230 > window.innerHeight : false
  const cardTop = rect
    ? showAbove
      ? Math.max(16, rect.top - 210)
      : Math.min(window.innerHeight - 210, rect.bottom + 16)
    : Math.max(16, window.innerHeight / 2 - 100)

  return (
    <div className="tutorial-layer" role="dialog" aria-modal="true"
      aria-label={`${activeTutorial.title} tutorial`}>
      {rect && <>
        <div className="tutorial-blocker" style={{
          inset: `0 0 ${window.innerHeight - rect.top}px 0`,
        }} />
        <div className="tutorial-blocker" style={{
          top: rect.top,
          left: 0,
          width: rect.left,
          height: rect.height,
        }} />
        <div className="tutorial-blocker" style={{
          top: rect.top,
          left: rect.right,
          right: 0,
          height: rect.height,
        }} />
        <div className="tutorial-blocker" style={{
          top: rect.bottom,
          right: 0,
          bottom: 0,
          left: 0,
        }} />
        <div className="tutorial-spotlight" style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }} />
      </>}
      {!rect && <div className="tutorial-blocker tutorial-blocker-full" />}
      <section className="tutorial-coach-card" style={{
        top: cardTop,
        left: cardLeft,
        width: cardWidth,
      } as CSSProperties}>
        <div className="tutorial-coach-progress">
          <span>Step {activeStepIndex + 1} of {activeTutorial.steps.length}</span>
          <button type="button" className="text-button"
            onClick={() => void exit()}>Exit tutorial</button>
        </div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tutorial-coach-actions">
          <button className="secondary-button" type="button"
            disabled={activeStepIndex === 0}
            onClick={() => void back()}>Back</button>
          {step.advance === 'next'
            ? <button type="button" onClick={() => void next()}>
                {activeStepIndex === activeTutorial.steps.length - 1
                  ? 'Finish'
                  : 'Next'}
              </button>
            : <span>Select the highlighted control to continue</span>}
        </div>
      </section>
    </div>
  )
}
