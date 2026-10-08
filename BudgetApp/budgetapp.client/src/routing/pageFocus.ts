export const skipNavigationEvent = 'budgetapp:skip-navigation'

export function isPageElementVisible(element: HTMLElement) {
  if (!element.isConnected) return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' ||
        style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}

// Headings/main landmarks are programmatic focus stops, not extra Tab stops.
// Restore any pre-existing attributes when focus leaves or the route changes.
export function focusPageElement(element: HTMLElement) {
  if (!isPageElementVisible(element) || element.closest('[inert]')) return () => {}
  const previousTabIndex = element.getAttribute('tabindex')
  const previousMarker = element.getAttribute('data-page-focus-target')
  if (element.tabIndex < 0) element.setAttribute('tabindex', '-1')
  element.setAttribute('data-page-focus-target', '')
  const restore = () => {
    if (previousTabIndex === null) element.removeAttribute('tabindex')
    else element.setAttribute('tabindex', previousTabIndex)
    if (previousMarker === null) element.removeAttribute('data-page-focus-target')
    else element.setAttribute('data-page-focus-target', previousMarker)
    element.removeEventListener('blur', restore)
  }
  element.addEventListener('blur', restore, { once: true })
  // Page headings now follow a shared section-tab row. Begin at the page's
  // natural top instead of scrolling the heading past that navigation. Other
  // focus stops (editors, cards, tutorial controls) retain their local position.
  if (element.matches('h1') && element.closest('.management-content, .dashboard-content')) {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    const bounds = element.getBoundingClientRect()
    if (bounds.top >= 0 && bounds.bottom <= window.innerHeight) {
      element.focus({ preventScroll: true })
      return restore
    }
  }
  const oldMargin = element.style.scrollMarginTop
  const hadStyle = element.hasAttribute('style')
  const target = element.getBoundingClientRect()
  const headerBottom = [...document.querySelectorAll<HTMLElement>('.app-sidebar, .app-context-header, .household-context-bar')]
    .filter(isPageElementVisible)
    .reduce((bottom, header) => {
      const position = getComputedStyle(header).position
      const box = header.getBoundingClientRect()
      // Include stacked/overlapping shell headers, never a desktop side rail.
      return (position === 'sticky' || position === 'fixed') && box.left < target.right && box.right > target.left
        ? Math.max(bottom, box.bottom) : bottom
    }, 0)
  if (headerBottom > 0) element.style.scrollMarginTop = `${headerBottom + 16}px`
  element.scrollIntoView?.({ behavior: 'auto', block: 'start' })
  element.style.scrollMarginTop = oldMargin
  if (!hadStyle && element.style.length === 0) element.removeAttribute('style')
  element.focus({ preventScroll: true })
  return restore
}

export function pageFocusTarget(main: HTMLElement) {
  return [...main.querySelectorAll<HTMLElement>('h1')].find(isPageElementVisible) ?? main
}
