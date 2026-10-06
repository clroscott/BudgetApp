import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTutorials } from '../tutorials/useTutorials'
import { appPages } from './pageRegistry'
import { focusPageElement, isPageElementVisible, pageFocusTarget, skipNavigationEvent } from './pageFocus'
import { useRouter } from './useRouter'

export function PageNavigation({ children }: { children: ReactNode }) {
  const { path } = useRouter()
  const { activeTutorial } = useTutorials()
  const rootRef = useRef<HTMLDivElement>(null)
  const lastPath = useRef(path)
  const pendingFocus = useRef(false)
  const pendingAnnouncement = useRef(false)
  const restoreFocus = useRef(() => {})
  const skipFrame = useRef<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [mainId, setMainId] = useState('main-content')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const pageLabel = appPages.find(page => page.path === path)?.label
    document.title = pageLabel ? `${pageLabel} | MC Budget` : 'MC Budget'
    if (lastPath.current !== path) {
      pendingFocus.current = !activeTutorial
      pendingAnnouncement.current = !activeTutorial
      lastPath.current = path
      setAnnouncement('')
    }
    // Tutorials own focus. Ending one must not release an old pending route focus.
    if (activeTutorial) {
      pendingFocus.current = false
      pendingAnnouncement.current = false
    }
    let mainWithOwnedId: HTMLElement | null = null
    const check = () => {
      const main = [...root.querySelectorAll<HTMLElement>('main')].find(isPageElementVisible)
      if (mainWithOwnedId && mainWithOwnedId !== main) {
        if (mainWithOwnedId.id === 'main-content') mainWithOwnedId.removeAttribute('id')
        mainWithOwnedId = null
      }
      if (!main) return
      if (!main.id) {
        main.id = 'main-content'
        mainWithOwnedId = main
      }
      setMainId(main.id)
      if ((!pendingFocus.current && !pendingAnnouncement.current) || main.getAttribute('aria-busy') === 'true') return
      const heading = pageFocusTarget(main)
      if (pendingAnnouncement.current) {
        pendingAnnouncement.current = false
        setAnnouncement(`${pageLabel ?? (heading.textContent?.trim() || 'New')} page loaded.`)
      }
      if (pendingFocus.current) {
        pendingFocus.current = false
        restoreFocus.current()
        restoreFocus.current = focusPageElement(heading)
      }
    }
    const cancelPending = () => { pendingFocus.current = false }
    const observer = new MutationObserver(check)
    observer.observe(root, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'aria-busy', 'inert'] })
    // A user who starts interacting during a delayed page load has chosen a new
    // focus destination. Do not move it later when a lazy component arrives.
    document.addEventListener('pointerdown', cancelPending, true)
    document.addEventListener('keydown', cancelPending, true)
    document.addEventListener('focusin', cancelPending, true)
    check()
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', cancelPending, true)
      document.removeEventListener('keydown', cancelPending, true)
      document.removeEventListener('focusin', cancelPending, true)
      restoreFocus.current()
      restoreFocus.current = () => {}
      if (mainWithOwnedId?.id === 'main-content') mainWithOwnedId.removeAttribute('id')
      if (skipFrame.current !== null) window.cancelAnimationFrame(skipFrame.current)
      skipFrame.current = null
    }
  }, [path, activeTutorial])

  const skip = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    pendingFocus.current = false
    window.dispatchEvent(new Event(skipNavigationEvent))
    if (skipFrame.current !== null) window.cancelAnimationFrame(skipFrame.current)
    // Let the shell close its transient narrow-screen menu before scrolling.
    skipFrame.current = window.requestAnimationFrame(() => {
      skipFrame.current = null
      const main = [...(rootRef.current?.querySelectorAll<HTMLElement>('main') ?? [])].find(isPageElementVisible)
      if (!main || main.closest('[inert]')) return
      const target = pageFocusTarget(main)
      restoreFocus.current()
      restoreFocus.current = focusPageElement(target)
    })
  }, [])

  return <>
    <a className="skip-to-content" href={`#${encodeURIComponent(mainId)}`} onClick={skip}>Skip to main content</a>
    <div className="page-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
    <div ref={rootRef}>{children}</div>
  </>
}
