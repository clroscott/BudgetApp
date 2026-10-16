import { useEffect, useRef, useState } from 'react'
import { focusPageElement, isPageElementVisible } from '../routing/pageFocus'

interface ErrorSummaryProps { errors: string[]; revealOnChange?: boolean; floating?: boolean }

export function ErrorSummary(props: ErrorSummaryProps) {
  if (props.errors.length === 0) return null
  // A changed/new failure gets its own notice, even if the previous one was
  // dismissed. Re-rendering an unchanged failure must not keep reopening it.
  return <ErrorSummaryContent key={JSON.stringify(props.errors)} {...props} />
}

function ErrorSummaryContent({ errors, revealOnChange = false, floating = false }: ErrorSummaryProps) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const showFloating = floating && !dismissed
  const messageKey = JSON.stringify(errors)
  useEffect(() => {
    const summary = summaryRef.current
    if (!summary || !revealOnChange) return
    if (showFloating) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      summary.focus({ preventScroll: true })
      return
    }
    if (floating) return // Dismissal leaves the inline message without jumping.
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
  }, [messageKey, revealOnChange, floating, showFloating])

  return (
    <div ref={summaryRef} className={`error-summary${showFloating ? ' error-notice' : ''}`} role="alert"
      aria-label={showFloating ? 'Error notification' : undefined} tabIndex={showFloating ? -1 : undefined}>
      {showFloating && <div className="error-notice-heading">
        <strong>Something needs attention</strong>
        <button type="button" className="text-button" aria-label="Dismiss error notification" onClick={() => {
          setDismissed(true)
          if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
        }}>Dismiss</button>
      </div>}
      {errors.map((error) => <p key={error}>{error}</p>)}
    </div>
  )
}
