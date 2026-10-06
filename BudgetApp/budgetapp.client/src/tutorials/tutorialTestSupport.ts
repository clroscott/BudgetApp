import { vi } from 'vitest'

// jsdom has no layout engine. Model rendered boxes, not CSS media-query behavior.
// Real breakpoint/zoom/screen-reader checks remain in the manual QA plan.
export function mockTutorialLayout() {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = Number(this.dataset.left ?? 40)
    const top = Number(this.dataset.top ?? 40)
    const width = Number(this.dataset.width ?? 180)
    const height = Number(this.dataset.height ?? 40)
    return { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) }
  })
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
}

export function restoreTutorialLayout() {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
}
