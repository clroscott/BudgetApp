import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorSummary } from './ErrorSummary'

let top = 150
beforeEach(() => {
  top = 150
  vi.stubGlobal('innerHeight', 800)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return this.classList.contains('error-summary') ? new DOMRect(300, top, 500, 60)
      : this.classList.contains('app-context-header') ? new DOMRect(250, 0, 700, 72) : new DOMRect()
  })
})
afterEach(() => vi.unstubAllGlobals())

function Example({ errors, reveal = true }: { errors: string[], reveal?: boolean }) {
  return <><div className="app-context-header" style={{ position: 'sticky' }} />
    <ErrorSummary errors={errors} revealOnChange={reveal} /><button type="button">Continue editing</button></>
}

describe('action-error visibility', () => {
  it('does not move focus for read/filter errors unless a page opts into action feedback', () => {
    const view = render(<Example errors={[]} reveal={false} />)
    screen.getByRole('button').focus()
    top = 1100
    view.rerender(<Example errors={['Read failed.']} reveal={false} />)
    expect(document.activeElement).toBe(screen.getByRole('button'))
  })
  it('brings a new off-screen failure into view with a deliberate focus stop', () => {
    const view = render(<Example errors={[]} />)
    screen.getByRole('button').focus()
    top = 1100
    view.rerender(<Example errors={['Save failed. Your corrections are kept.']} />)
    expect(document.activeElement).toBe(screen.getByRole('alert'))
    expect(screen.getByRole('alert').getAttribute('tabindex')).toBe('-1')
  })
  it('also reveals feedback hidden behind the sticky context header', () => {
    const view = render(<Example errors={[]} />)
    top = 40
    view.rerender(<Example errors={['Try saving again.']} />)
    expect(document.activeElement).toBe(screen.getByRole('alert'))
  })
  it('leaves focus alone when feedback is visible or its message has not changed', () => {
    const view = render(<Example errors={[]} />)
    const editing = screen.getByRole('button')
    editing.focus()
    view.rerender(<Example errors={['Save failed.']} />)
    expect(document.activeElement).toBe(editing)
    top = 1100
    fireEvent.focus(editing)
    view.rerender(<Example errors={['Save failed.']} />)
    expect(document.activeElement).toBe(editing)
  })
})
