import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { TutorialKind, TutorialStep } from './tutorialDefinitions'
import { isEnabledTarget, isTutorialVisible } from './tutorialTargets'

const interactive = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"],[role="button"]'

function focusElement(element: HTMLElement) {
  const previous = element.getAttribute('tabindex')
  if (element.tabIndex < 0) element.setAttribute('tabindex', '-1')
  element.focus({ preventScroll: true })
  if (previous === null) element.removeAttribute('tabindex')
  else element.setAttribute('tabindex', previous)
}

function targetFocusElement(target: HTMLElement) {
  return [target, ...target.querySelectorAll<HTMLElement>(interactive)]
    .find(element => element.tabIndex >= 0 && isEnabledTarget(element) && isTutorialVisible(element) && !element.closest('[inert]'))
    ?? target.querySelector<HTMLElement>('h1,h2,h3,h4') ?? target
}

export function useTutorialFocus({ active, step, kind, target, layerRef, headingRef, descriptionId, exit }: {
  active: boolean
  step: TutorialStep | undefined
  kind: TutorialKind | undefined
  target: HTMLElement | null
  layerRef: RefObject<HTMLDivElement | null>
  headingRef: RefObject<HTMLHeadingElement | null>
  descriptionId: string
  exit: () => Promise<void>
}) {
  const activeRef = useRef(active)
  const lastStep = useRef<TutorialStep | undefined>(undefined)
  const focusTargetRef = useRef(() => {})

  useLayoutEffect(() => {
    activeRef.current = active
    if (!active) return
    const originalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      activeRef.current = false
      lastStep.current = undefined
      // Isolation cleanup runs before restoration; a replay must not receive old focus.
      queueMicrotask(() => {
        if (activeRef.current) return
        const fallback = [...document.querySelectorAll<HTMLElement>('main h1,.page-header h1,h1,[data-tutorial-id="nav-tutorials"]')]
          .find(isTutorialVisible)
        const destination = originalFocus && originalFocus !== document.body && isTutorialVisible(originalFocus)
          ? originalFocus : fallback
        if (destination) focusElement(destination)
      })
    }
  }, [active])

  useLayoutEffect(() => {
    const layer = layerRef.current
    const heading = headingRef.current
    if (!active || !step || !layer || !heading) return
    const ownedInert = new Set<HTMLElement>()
    const described = new Map<HTMLElement, string | null>()
    const allowed = (node: Node) => layer.contains(node) || !!target?.contains(node)
    const block = (element: HTMLElement) => {
      if (element.hasAttribute('inert')) return
      ownedInert.add(element)
      element.setAttribute('data-tutorial-inert', '')
      element.setAttribute('inert', '')
    }
    const isolate = (element: HTMLElement) => {
      if (element === layer || element === target) return
      if (element.contains(layer) || target && element.contains(target)) {
        for (const child of element.children) if (child instanceof HTMLElement) isolate(child)
      } else block(element)
    }
    const reconcile = () => {
      isolate(document.body)
      // An informational Learn-only spotlight is for reading, not operating forms.
      if (kind === 'LearnOnly' && step.advance === 'next' && target) {
        if (target.matches(interactive)) block(target)
        target.querySelectorAll<HTMLElement>(interactive).forEach(block)
      }
    }
    reconcile()
    const observer = new MutationObserver(reconcile)
    observer.observe(document.body, { childList: true, subtree: true })
    // Let the card's scroll container reveal focused controls at high zoom.
    const focusCoach = () => heading.focus()
    const focusTarget = () => {
      if (!target || !isTutorialVisible(target)) return
      const destination = targetFocusElement(target)
      if (!described.has(destination)) described.set(destination, destination.getAttribute('aria-describedby'))
      const ids = new Set((destination.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean))
      ids.add(descriptionId)
      destination.setAttribute('aria-describedby', [...ids].join(' '))
      focusElement(destination)
    }
    focusTargetRef.current = focusTarget
    const focusables = (root: HTMLElement | null) => root ? [root, ...root.querySelectorAll<HTMLElement>(interactive)]
      .filter(element => element.tabIndex >= 0 && isEnabledTarget(element) && isTutorialVisible(element) && !element.closest('[inert]')) : []
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && (!allowed(event.target) || event.target.closest('[inert]'))) focusCoach()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        void exit()
      } else if (event.key === 'Tab') {
        const choices = [...new Set([...focusables(layer), ...focusables(target)])]
        const current = choices.indexOf(document.activeElement as HTMLElement)
        const index = current < 0 ? (event.shiftKey ? choices.length - 1 : 0)
          : (current + (event.shiftKey ? -1 : 1) + choices.length) % choices.length
        event.preventDefault()
        event.stopPropagation()
        if (choices[index]) choices[index].focus()
        else focusCoach()
      } else if (event.target instanceof HTMLElement && (!allowed(event.target) || event.target.closest('[inert]'))) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Element && (!allowed(event.target) || event.target.closest('[inert]'))) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener('focusin', handleFocus, true)
    document.addEventListener('keydown', handleKey, true)
    document.addEventListener('click', handleClick, true)
    if (lastStep.current !== step || !allowed(document.activeElement ?? document.body)) focusCoach()
    lastStep.current = step
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', handleFocus, true)
      document.removeEventListener('keydown', handleKey, true)
      document.removeEventListener('click', handleClick, true)
      for (const element of ownedInert) {
        element.removeAttribute('inert')
        element.removeAttribute('data-tutorial-inert')
      }
      for (const [element, previous] of described) {
        if (previous === null) element.removeAttribute('aria-describedby')
        else element.setAttribute('aria-describedby', previous)
      }
      focusTargetRef.current = () => {}
    }
  }, [active, step, kind, target, layerRef, headingRef, descriptionId, exit])

  return () => focusTargetRef.current()
}
