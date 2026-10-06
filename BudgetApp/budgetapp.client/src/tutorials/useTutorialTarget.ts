import { useEffect, useState } from 'react'
import type { TutorialKind, TutorialStep } from './tutorialDefinitions'
import { isEnabledTarget, isInternalNavigation, isTutorialVisible, revealTutorialNavigationEvent, tutorialElement } from './tutorialTargets'

export interface TargetRect {
  top: number, left: number, right: number, bottom: number, width: number, height: number
}
type TargetPhase = 'waiting' | 'ready' | 'unavailable'
interface TargetState {
  step: TutorialStep | undefined
  phase: TargetPhase
  target: HTMLElement | null
  rect: TargetRect | null
}
export const tutorialTargetWaitMs = 5000

function targetRect(element: HTMLElement): TargetRect | null {
  const bounds = element.getBoundingClientRect()
  const top = Math.max(0, bounds.top - 8)
  const left = Math.max(0, bounds.left - 8)
  const right = Math.min(window.innerWidth, bounds.right + 8)
  const bottom = Math.min(window.innerHeight, bounds.bottom + 8)
  return right > left && bottom > top
    ? { top, left, right, bottom, width: right - left, height: bottom - top } : null
}

export function useTutorialTarget(step: TutorialStep | undefined, kind: TutorialKind | undefined) {
  const [retryVersion, setRetryVersion] = useState(0)
  const [state, setState] = useState<TargetState>({ step: undefined, phase: 'waiting', target: null, rect: null })
  useEffect(() => {
    if (!step) return
    let phase: TargetPhase = 'waiting'
    let timeout: number | undefined
    let lastTarget: HTMLElement | null = null
    let observedElement: HTMLElement | null = null
    let stopped = false
    const update = (target: HTMLElement | null, rect: TargetRect | null) => {
      setState(current => {
        const next = { step, phase, target, rect }
        return current.step === step && current.phase === phase && current.target === target &&
          JSON.stringify(current.rect) === JSON.stringify(rect) ? current : next
      })
    }
    const beginWaiting = () => {
      if (phase === 'ready') phase = 'waiting'
      if (phase === 'waiting' && timeout === undefined) timeout = window.setTimeout(() => {
        timeout = undefined
        if (stopped) return
        phase = 'unavailable'
        update(null, null)
      }, tutorialTargetWaitMs)
      update(null, null)
    }
    const check = () => {
      if (stopped) return
      const candidates = tutorialElement(step.targetId)
      let element = candidates.find(candidate => isTutorialVisible(candidate) &&
        (step.advance !== 'click' || isEnabledTarget(candidate))) ?? null
      if (!element && step.targetId.startsWith('nav-')) {
        const menu = tutorialElement('sidebar-menu').find(candidate => isTutorialVisible(candidate) && isEnabledTarget(candidate))
        if (menu?.getAttribute('aria-expanded') === 'false') {
          // Reveal UI only. Never synthesize a click on a task/action control.
          menu.dispatchEvent(new Event(revealTutorialNavigationEvent, { bubbles: true }))
        }
      }
      if (kind === 'LearnOnly' && step.advance === 'click' && element &&
          (!step.targetId.startsWith('nav-') || !isInternalNavigation(element))) element = null
      const rawElement = element ?? candidates[0] ?? null
      if (rawElement !== observedElement) {
        resizeObserver?.disconnect()
        observedElement = rawElement
        if (rawElement) resizeObserver?.observe(rawElement)
      }
      if (element && element !== lastTarget) {
        element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
        lastTarget = element
      }
      const rect = element ? targetRect(element) : null
      if (!element || !rect) {
        if (!element) lastTarget = null
        beginWaiting()
        return
      }
      if (timeout !== undefined) window.clearTimeout(timeout)
      timeout = undefined
      phase = 'ready'
      update(element, rect)
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    const observer = new MutationObserver(check)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-tutorial-id', 'href', 'target', 'style', 'class', 'hidden', 'aria-hidden', 'aria-expanded', 'disabled', 'aria-disabled', 'inert'] })
    window.addEventListener('resize', check)
    window.addEventListener('scroll', check, true)
    check()
    return () => {
      stopped = true
      if (timeout !== undefined) window.clearTimeout(timeout)
      observer.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', check)
      window.removeEventListener('scroll', check, true)
    }
  }, [step, kind, retryVersion])
  return { ...(state.step === step ? state : { step, phase: 'waiting' as const, target: null, rect: null }),
    retry: () => setRetryVersion(version => version + 1) }
}
