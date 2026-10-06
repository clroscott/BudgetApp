import { describe, expect, it, vi } from 'vitest'
import { focusPageElement } from './pageFocus'

describe('page focus visibility and restoration', () => {
  it('offsets an overlapping sticky header while preserving original styles and focus attributes', () => {
    const sidebar = document.createElement('aside')
    sidebar.className = 'app-sidebar'
    sidebar.style.position = 'sticky'
    const heading = document.createElement('h1')
    heading.textContent = 'Page heading'
    heading.style.scrollMarginTop = '5px'
    heading.tabIndex = 0
    heading.setAttribute('data-page-focus-target', 'existing')
    document.body.append(sidebar, heading)
    vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 390, 120))
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 200, 350, 40))
    let marginWhenScrolled = ''
    Object.defineProperty(heading, 'scrollIntoView', { value: vi.fn(() => { marginWhenScrolled = heading.style.scrollMarginTop }) })
    try {
      const restore = focusPageElement(heading)
      expect(marginWhenScrolled).toBe('136px')
      expect(heading.style.scrollMarginTop).toBe('5px')
      expect(document.activeElement).toBe(heading)
      restore()
      expect(heading.getAttribute('tabindex')).toBe('0')
      expect(heading.getAttribute('data-page-focus-target')).toBe('existing')
    } finally { sidebar.remove(); heading.remove() }
  })

  it('does not offset a non-overlapping desktop side rail or focus hidden/inert content', () => {
    const sidebar = document.createElement('aside')
    sidebar.className = 'app-sidebar'
    sidebar.style.position = 'sticky'
    const main = document.createElement('main')
    const elsewhere = document.createElement('button')
    document.body.append(sidebar, main, elsewhere)
    vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 250, 900))
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(new DOMRect(270, 0, 600, 400))
    let marginWhenScrolled = ''
    Object.defineProperty(main, 'scrollIntoView', { value: vi.fn(() => { marginWhenScrolled = main.style.scrollMarginTop }) })
    try {
      focusPageElement(main)()
      expect(marginWhenScrolled).toBe('')
      expect(main.hasAttribute('style')).toBe(false)
      elsewhere.focus()
      main.hidden = true
      focusPageElement(main)()
      expect(document.activeElement).not.toBe(main)
      main.hidden = false
      main.setAttribute('inert', '')
      focusPageElement(main)()
      expect(document.activeElement).not.toBe(main)
    } finally { sidebar.remove(); main.remove(); elsewhere.remove() }
  })
})
