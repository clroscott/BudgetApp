import { useEffect, useRef } from 'react'
import { focusPageElement, isPageElementVisible } from '../routing/pageFocus'

export function ErrorSummary({ errors, revealOnChange = false }: { errors: string[], revealOnChange?: boolean }) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const messageKey = JSON.stringify(errors)
  useEffect(() => {
    const summary = summaryRef.current
    if (!summary || !revealOnChange) return
    const box = summary.getBoundingClientRect()
    const headerBottom = [...document.querySelectorAll<HTMLElement>('.app-sidebar, .app-context-header')]
      .filter(isPageElementVisible)
      .reduce((bottom, header) => {
        const position = getComputedStyle(header).position
        const bounds = header.getBoundingClientRect()
        return (position === 'sticky' || position === 'fixed') && bounds.left < box.right && bounds.right > box.left
          ? Math.max(bottom, bounds.bottom) : bottom
      }, 0)
    // A newly failed action must not leave its explanation above the user's
    // scroll position. Already-visible feedback and unchanged errors keep focus.
    if (box.height > 0 && (box.top < headerBottom || box.bottom > window.innerHeight)) {
      return focusPageElement(summary)
    }
  }, [messageKey, revealOnChange])
  if (errors.length === 0) {
    return null
  }

  return (
    <div ref={summaryRef} className="error-summary" role="alert">
      {errors.map((error) => <p key={error}>{error}</p>)}
    </div>
  )
}
