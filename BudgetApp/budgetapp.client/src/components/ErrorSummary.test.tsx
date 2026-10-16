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
  it('shows an opted-in floating notice, focuses it without scrolling, and keeps the inline error on dismiss', () => {
    const view = render(<><button>Upload</button><ErrorSummary errors={[]} floating revealOnChange /></>)
    const upload = screen.getByRole('button', { name: 'Upload' })
    upload.focus()
    view.rerender(<><button>Upload</button><ErrorSummary errors={['Duplicate file. Review your choice.']} floating revealOnChange /></>)
    const alert = screen.getByRole('alert', { name: 'Error notification' })
    expect(alert.classList.contains('error-notice')).toBe(true)
    expect(document.activeElement).toBe(alert)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error notification' }))
    expect(screen.getByText('Duplicate file. Review your choice.')).toBeTruthy()
    expect(screen.getByRole('alert').classList.contains('error-notice')).toBe(false)
    expect(document.activeElement).toBe(upload)
    view.rerender(<><button>Upload</button><ErrorSummary errors={['Duplicate file. Review your choice.']} floating revealOnChange /></>)
    expect(screen.queryByRole('button', { name: 'Dismiss error notification' })).toBeNull()
    view.rerender(<><button>Upload</button><ErrorSummary errors={[]} floating revealOnChange /></>)
    view.rerender(<><button>Upload</button><ErrorSummary errors={['Duplicate file. Review your choice.']} floating revealOnChange /></>)
    expect(screen.getByRole('button', { name: 'Dismiss error notification' })).toBeTruthy()
  })

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
