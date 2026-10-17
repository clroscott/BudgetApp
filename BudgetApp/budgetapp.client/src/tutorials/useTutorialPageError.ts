import { useEffect, useState } from 'react'
import { isTutorialVisible } from './tutorialTargets'

// Observe existing page feedback, not API errors or their private contents.
// The coach lives outside main, so its own alerts cannot pause it recursively.
export function useTutorialPageError(host: HTMLElement | null, rowValidationIsTask = false) {
  const [error, setError] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const page = host?.closest('main')
    if (!page) return
    const check = () => {
      const next = [...page.querySelectorAll<HTMLElement>('[role="alert"]')].find(element =>
        !(rowValidationIsTask && element.classList.contains('row-validation-message')) && isTutorialVisible(element)) ?? null
      setError(current => current === next ? current : next)
    }
    const observer = new MutationObserver(check)
    observer.observe(page, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['role', 'style', 'class', 'hidden', 'aria-hidden'] })
    check()
    return () => observer.disconnect()
  }, [host, rowValidationIsTask])
  return error?.isConnected && host?.closest('main')?.contains(error) ? error : null
}
