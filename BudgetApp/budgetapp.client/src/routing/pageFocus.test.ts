import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

let originalScroll: PropertyDescriptor | undefined
beforeEach(() => { originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView') })
afterEach(() => {
  document.querySelector('[data-focus-fixture]')?.remove()
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})
function box(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }
}
function fixture(narrow = false) {
  const root = document.createElement('div')
  root.dataset.focusFixture = ''
  root.innerHTML = '<aside class="app-sidebar" style="position:sticky"></aside><div class="household-context-bar" style="position:sticky"></div><h1 style="scroll-margin-top:12px">Help topic</h1>'
  document.body.append(root)
  const sidebar = root.querySelector<HTMLElement>('aside')!
  const context = root.querySelector<HTMLElement>('.household-context-bar')!
  const heading = root.querySelector<HTMLHeadingElement>('h1')!
  vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(narrow ? box(0, 0, 390, 70) : box(0, 0, 220, 800))
  vi.spyOn(context, 'getBoundingClientRect').mockReturnValue(narrow ? box(0, 70, 390, 60) : box(220, 0, 780, 60))
  vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(narrow ? box(20, 300, 350, 40) : box(300, 300, 650, 40))
  let scrollMargin = ''
  const scroll = vi.fn(function (this: HTMLElement) { scrollMargin = this.style.scrollMarginTop })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  return { sidebar, context, heading, scroll, margin: () => scrollMargin }
}
describe('visible heading scroll offset', () => {
  it('keeps the shared page start and section tabs visible while focusing a page heading', () => {
    const root = document.createElement('section')
    root.dataset.focusFixture = ''
    root.className = 'management-content'
    root.innerHTML = '<nav class="budgeting-section-nav"><a href="/import">Import transactions</a></nav><div class="page-title-row"><h1>Import CSV</h1></div>'
    document.body.append(root)
    const heading = root.querySelector('h1')!
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(box(250, 180, 700, 45))
    const scroll = vi.fn()
    Object.defineProperty(heading, 'scrollIntoView', { configurable: true, value: scroll })
    const restore = focusPageElement(heading)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
    expect(scroll).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(heading)
    restore()
    expect(heading.hasAttribute('tabindex')).toBe(false)
  })
  it('still reveals a heading if it does not fit in a short zoomed viewport', () => {
    const root = document.createElement('section')
    root.dataset.focusFixture = ''
    root.className = 'management-content'
    root.innerHTML = '<h1>Long page heading</h1>'
    document.body.append(root)
    const heading = root.querySelector('h1')!
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(box(0, window.innerHeight + 50, 200, 70))
    const scroll = vi.fn()
    Object.defineProperty(heading, 'scrollIntoView', { configurable: true, value: scroll })
    focusPageElement(heading)()
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(document.activeElement).toBe(heading)
  })
  it.each([false, true])('accounts for the consolidated context/profile header (narrow=%s)', narrow => {
    const { heading, context, margin } = fixture(narrow)
    context.className = 'app-context-header'
    focusPageElement(heading)()
    expect(margin()).toBe(narrow ? '146px' : '76px')
    expect(heading.style.scrollMarginTop).toBe('12px')
  })
  it('keeps desktop topic headings below the household header without treating the side rail as a header', () => {
    const { heading, scroll, margin } = fixture()
    const restore = focusPageElement(heading)
    expect(margin()).toBe('76px')
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(document.activeElement).toBe(heading)
    expect(heading.style.scrollMarginTop).toBe('12px')
    restore()
    expect(heading.hasAttribute('tabindex')).toBe(false)
  })
  it('accounts for both narrow shell headers and restores the original inline margin', () => {
    const { heading, margin } = fixture(true)
    focusPageElement(heading)()
    expect(margin()).toBe('146px')
    expect(heading.style.scrollMarginTop).toBe('12px')
  })
  it('ignores hidden or non-sticky context bars on a standalone help page', () => {
    const { heading, context, margin } = fixture()
    context.hidden = true
    focusPageElement(heading)()
    expect(margin()).toBe('12px')
    context.hidden = false
    context.style.position = 'static'
    focusPageElement(heading)()
    expect(margin()).toBe('12px')
  })
})
