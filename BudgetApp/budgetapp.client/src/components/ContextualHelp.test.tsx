import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { helpTopics, helpTopicUrl } from '../help/helpTopics'
import { RouterProvider } from '../routing/RouterProvider'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { ContextualHelp } from './ContextualHelp'

describe('inline contextual help', () => {
  it.each(helpTopics)('uses a native, named disclosure and a stable topic link for $id', topic => {
    render(<RouterProvider><ContextualHelp topic={topic.id} /></RouterProvider>)
    const summary = screen.getByText(topic.trigger)
    const details = summary.closest('details')!
    expect(summary.tagName).toBe('SUMMARY')
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    expect(details.open).toBe(true)
    expect(screen.getByText(topic.summary)).toBeTruthy()
    expect(screen.getByRole('link', { name: `Read more: ${topic.title}` }).getAttribute('href')).toBe(helpTopicUrl(topic.id))
    fireEvent.click(summary)
    expect(details.open).toBe(false)
  })
  it('Escape closes open help and returns focus to its summary without blocking other keyboard use', () => {
    render(<RouterProvider><ContextualHelp topic="scope-privacy" /><button>Next control</button></RouterProvider>)
    const summary = screen.getByText('About scope and privacy')
    fireEvent.click(summary)
    const link = screen.getByRole('link', { name: 'Read more: Scope and privacy' })
    link.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    link.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
    fireEvent.keyDown(link, { key: 'Escape' })
    expect(summary.closest('details')!.open).toBe(false)
    expect(document.activeElement).toBe(summary)
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    summary.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(false)
  })
  it('expanding help inside a dirty form never submits, navigates, or clears its guard', () => {
    const save = vi.fn()
    function Form() {
      const [value, setValue] = useState('')
      useUnsavedChangesGuard(Boolean(value), 'Keep this correction?')
      return <form onSubmit={save}><label>Correction<input value={value} onChange={event => setValue(event.target.value)} /></label>
        <ContextualHelp topic="import-approval" /><button>Save correction</button></form>
    }
    window.history.replaceState(null, '', '/imports/review?importId=sample')
    render(<RouterProvider><Form /></RouterProvider>)
    fireEvent.change(screen.getByLabelText('Correction'), { target: { value: 'Keep this' } })
    fireEvent.click(screen.getByText('About import approval'))
    expect(save).not.toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Read more: Import review and approval' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/imports/review')
    expect((screen.getByLabelText('Correction') as HTMLInputElement).value).toBe('Keep this')
    const close = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(close)
    expect(close.defaultPrevented).toBe(true)
    expect(save).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('link', { name: 'Read more: Import review and approval' }))
    expect(window.location.pathname + window.location.hash).toBe('/help#import-approval')
    expect(save).not.toHaveBeenCalled()
  })
  it('does not create any browser-storage state for expanding or closing help', () => {
    const fetch = vi.spyOn(window, 'fetch')
    const store = vi.spyOn(Storage.prototype, 'setItem')
    render(<RouterProvider><ContextualHelp topic="annual-targets" /></RouterProvider>)
    fireEvent.click(screen.getByText('About annual targets'))
    fireEvent.keyDown(screen.getByText('About annual targets'), { key: 'Escape' })
    expect(fetch).not.toHaveBeenCalled()
    expect(store).not.toHaveBeenCalled()
  })
})
