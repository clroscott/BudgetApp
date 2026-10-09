import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AmountCalculator } from './AmountCalculator'

function show(disabled = false) {
  const onApply = vi.fn()
  const outsideKey = vi.fn()
  render(<div onKeyDown={outsideKey}><button>Outside control</button>
    <AmountCalculator label="Housing budget" value="1200" disabled={disabled} onApply={onApply} />
  </div>)
  const trigger = screen.getByRole('button', { name: 'Open calculator for Housing budget' })
  if (!disabled) fireEvent.click(trigger)
  return { onApply, outsideKey, trigger }
}

describe('calculator keyboard dismissal and focus', () => {
  it('opening another calculator dismisses the first without applying and focuses the new calculation', () => {
    const firstApply = vi.fn()
    const secondApply = vi.fn()
    render(<>
      <AmountCalculator label="Housing budget" value="1200" disabled={false} onApply={firstApply} />
      <AmountCalculator label="Food budget" value="300" disabled={false} onApply={secondApply} />
    </>)
    const first = screen.getByRole('button', { name: 'Open calculator for Housing budget' })
    const second = screen.getByRole('button', { name: 'Open calculator for Food budget' })
    fireEvent.click(first)
    fireEvent.change(screen.getByLabelText('Calculation'), { target: { value: '100 / 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Equals' }))
    expect(screen.getByRole('status').textContent).toBe('Result: 25')

    fireEvent.click(second)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Food budget calculator' })).toBeTruthy()
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(second.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Calculation'))
    expect((screen.getByLabelText('Calculation') as HTMLInputElement).value).toBe('300')
    expect(firstApply).not.toHaveBeenCalled()
    expect(secondApply).not.toHaveBeenCalled()

    fireEvent.click(first)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect((screen.getByLabelText('Calculation') as HTMLInputElement).value).toBe('1200')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps only the last calculator open when triggers are activated in the same batch', () => {
    render(<>
      <AmountCalculator label="First" value="1" disabled={false} onApply={vi.fn()} />
      <AmountCalculator label="Second" value="2" disabled={false} onApply={vi.fn()} />
    </>)
    act(() => {
      screen.getByRole('button', { name: 'Open calculator for First' }).click()
      screen.getByRole('button', { name: 'Open calculator for Second' }).click()
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Second calculator' })).toBeTruthy()
  })

  it.each(['pointerdown', 'click'])('outside %s dismisses without applying or taking focus back', eventType => {
    const { onApply, trigger } = show()
    fireEvent.change(screen.getByLabelText('Calculation'), { target: { value: '100 / 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Equals' }))
    const outside = screen.getByRole('button', { name: 'Outside control' })
    outside.focus()
    if (eventType === 'pointerdown') fireEvent.pointerDown(outside)
    else fireEvent.click(outside)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(outside)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('interacting inside the calculator does not dismiss it', () => {
    const { onApply } = show()
    const input = screen.getByLabelText('Calculation')
    fireEvent.pointerDown(input)
    fireEvent.change(input, { target: { value: '100 / 4' } })
    const equals = screen.getByRole('button', { name: 'Equals' })
    fireEvent.pointerDown(equals)
    fireEvent.click(equals)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Result: 25')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('leaving the browser window dismisses without applying', () => {
    const { onApply } = show()
    fireEvent.blur(window)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('unmounting an open calculator releases its active registration and listeners', () => {
    const { unmount } = render(<AmountCalculator label="Old" value="10" disabled={false} onApply={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open calculator for Old' }))
    unmount()
    const { trigger, onApply } = show()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside control' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close calculator' }))
    expect(document.activeElement).toBe(trigger)
    expect(onApply).not.toHaveBeenCalled()
  })

  it.each(['Calculation', 'Seven', 'Close calculator', 'Open calculator for Housing budget'])('Escape from %s closes without applying and restores trigger focus', name => {
    const { onApply, outsideKey, trigger } = show()
    expect(document.activeElement).toBe(screen.getByLabelText('Calculation'))
    const control = name === 'Calculation' ? screen.getByLabelText(name) : screen.getByRole('button', { name })
    control.focus()
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(onApply).not.toHaveBeenCalled()
    expect(outsideKey).not.toHaveBeenCalled()
  })

  it('Close restores focus and reopening resets the expression from the field', () => {
    const { trigger, onApply } = show()
    fireEvent.change(screen.getByLabelText('Calculation'), { target: { value: '100 / 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close calculator' }))
    expect(document.activeElement).toBe(trigger)
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    expect((screen.getByLabelText('Calculation') as HTMLInputElement).value).toBe('1200')
    expect(document.activeElement).toBe(screen.getByLabelText('Calculation'))
    expect(trigger.getAttribute('aria-controls')).toBe(screen.getByRole('dialog').id)
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBeNull()
  })

  it('Enter calculates without applying or submitting; Use result applies once and returns focus', () => {
    const { trigger, onApply } = show()
    const input = screen.getByLabelText('Calculation')
    fireEvent.change(input, { target: { value: '1200 / 12 + 5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('status').textContent).toBe('Result: 105')
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use result' }))
    expect(onApply).toHaveBeenCalledExactlyOnceWith('105')
    expect(document.activeElement).toBe(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is non-modal: no Tab interception, and Escape outside does not close another control', () => {
    const { outsideKey } = show()
    const input = screen.getByLabelText('Calculation')
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true)
    const outside = screen.getByRole('button', { name: 'Outside control' })
    outside.focus()
    fireEvent.keyDown(outside, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(outsideKey).toHaveBeenCalledTimes(2)
  })

  it('keeps arithmetic validation and accessible keypad controls, and cannot open when disabled', () => {
    const { unmount } = render(<AmountCalculator label="Test" value="" disabled={false} onApply={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open calculator for Test' }))
    const dialog = screen.getByRole('dialog')
    for (const name of ['One', 'Zero', 'Divide', 'Zero', 'Equals']) fireEvent.click(within(dialog).getByRole('button', { name }))
    expect(screen.getByRole('alert').textContent).toBe('Cannot divide by zero.')
    expect((screen.getByRole('button', { name: 'Use result' }) as HTMLButtonElement).disabled).toBe(true)
    unmount()
    const { trigger } = show(true)
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
