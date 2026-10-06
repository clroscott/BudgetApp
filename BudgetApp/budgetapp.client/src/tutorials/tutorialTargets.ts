export const revealTutorialNavigationEvent = 'budgetapp:tutorial-reveal-navigation'

export function tutorialElement(targetId: string) {
  // Exact attribute matching keeps IDs stable without building a CSS selector
  // from text, and allows a visible copy to win if a layout has duplicate nodes.
  return [...document.querySelectorAll<HTMLElement>('[data-tutorial-id]')]
    .filter(element => element.dataset.tutorialId === targetId)
}

export function isTutorialVisible(element: HTMLElement) {
  if (!element.isConnected) return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' ||
        node.hasAttribute('inert') && !node.hasAttribute('data-tutorial-inert')) return false
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
        style.opacity === '0' || style.contentVisibility === 'hidden') return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function isEnabledTarget(element: HTMLElement) {
  return !element.matches(':disabled') && !element.closest('[aria-disabled="true"]')
}

export function isInternalNavigation(element: HTMLElement) {
  if (!(element instanceof HTMLAnchorElement) || !element.hasAttribute('href') || element.hasAttribute('download')) return false
  const url = new URL(element.href, window.location.href)
  return url.origin === window.location.origin && url.pathname.startsWith('/') &&
    (!element.target || element.target === '_self')
}
