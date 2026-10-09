import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { PageFrame } from './PageFrame'

describe('shared page frame', () => {
  it('exposes the measured page ref and keeps fixed actions outside the content column', () => {
    const ref = createRef<HTMLElement>()
    const view = render(<PageFrame className="budget-page" contentClassName="budget-content" ref={ref}
      footer={<section aria-label="Budget actions"><button>Save budget</button></section>}>
      <h1>Monthly budget</h1>
    </PageFrame>)
    const main = screen.getByRole('main')
    expect(ref.current).toBe(main)
    expect(main.className).toBe('page-frame budget-page')
    expect(main.firstElementChild?.className).toBe('page-frame-content budget-content')
    expect(screen.getByRole('region', { name: 'Budget actions' }).parentElement).toBe(main)
    expect(screen.getByRole('heading').closest('.page-frame-content')).toBe(main.firstElementChild)
    view.unmount()
    expect(ref.current).toBeNull()
  })
  it('provides one main landmark and one content column without duplicating shell context', () => {
    const view = render(<PageFrame contentClassName="import-content"><h1>Import transactions</h1><button>Upload</button></PageFrame>)
    const main = screen.getByRole('main')
    expect(main.className).toBe('page-frame')
    expect(main.firstElementChild?.className).toBe('page-frame-content import-content')
    expect(main.contains(screen.getByRole('heading', { name: 'Import transactions' }))).toBe(true)
    expect(view.container.querySelector('header')).toBeNull()
    expect(view.container.querySelector('nav')).toBeNull()
  })
  it('keeps feature markup, tutorial targets and input values intact across rerenders', () => {
    const content = <div data-tutorial-id="stable-target"><label>Description<input defaultValue="Unsaved sample" /></label></div>
    const view = render(<PageFrame>{content}</PageFrame>)
    const input = screen.getByLabelText('Description') as HTMLInputElement
    input.value = 'Pending correction'
    view.rerender(<PageFrame contentClassName="transaction-content">{content}</PageFrame>)
    expect(screen.getByLabelText('Description')).toBe(input)
    expect(input.value).toBe('Pending correction')
    expect(view.container.querySelector('[data-tutorial-id="stable-target"]')).not.toBeNull()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})
