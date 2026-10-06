import { fireEvent, render, screen, within } from '@testing-library/react'
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
