import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider } from '../routing/RouterProvider'
import { SectionNavigation } from './SectionNavigation'

afterEach(() => vi.unstubAllGlobals())

describe('section navigation scroll lane', () => {
  it('reveals an offscreen active link without scrolling the page or taking focus', () => {
    let left = 600
    const disconnect = vi.fn()
    let resized!: () => void
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback }
      observe() {}
      disconnect = disconnect
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.matches('[aria-current="page"]') ? new DOMRect(left, 0, 100, 44) : new DOMRect(0, 0, 300, 44)
    })
    const focused = document.activeElement
    const view = render(<RouterProvider><SectionNavigation section="budgeting" currentPath="/settings/categories" label="Budgeting pages" /></RouterProvider>)
    const nav = screen.getByRole('navigation', { name: 'Budgeting pages' })
    expect(nav.scrollLeft).toBe(408)
    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(focused)
    left = -20
    act(() => resized())
    expect(nav.scrollLeft).toBe(380)
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
  it('leaves a fully visible desktop lane alone and works without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(900)
    render(<RouterProvider><SectionNavigation section="budgeting" currentPath="/budgeting" label="Budgeting pages" /></RouterProvider>)
    const nav = screen.getByRole('navigation', { name: 'Budgeting pages' })
    expect(nav.scrollLeft).toBe(0)
    expect(screen.getByRole('link', { name: 'Monthly budget' }).getAttribute('aria-current')).toBe('page')
    act(() => window.dispatchEvent(new Event('resize')))
    expect(nav.scrollLeft).toBe(0)
  })
})
