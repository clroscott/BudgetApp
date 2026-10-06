import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { AppIcon } from './AppIcon'

function evaluateExpression(displayExpression: string): number {
  const source = displayExpression
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
  let index = 0

  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? '')) index++
  }

  const parseNumber = () => {
    skipWhitespace()
    const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
    if (!match) throw new Error('Enter a number or calculation.')
    index += match[0].length
    return Number(match[0])
  }

  const parseFactor = (): number => {
    skipWhitespace()
    if (source[index] === '+') {
      index++
      return parseFactor()
    }
    if (source[index] === '-') {
      index++
      return -parseFactor()
    }
    if (source[index] === '(') {
      index++
      const value = parseExpression()
      skipWhitespace()
      if (source[index] !== ')') throw new Error('A closing parenthesis is missing.')
      index++
      return value
    }
    return parseNumber()
  }

  const parseTerm = (): number => {
    let value = parseFactor()
    while (true) {
      skipWhitespace()
      const operator = source[index]
      if (operator !== '*' && operator !== '/') return value
      index++
      const operand = parseFactor()
      if (operator === '/' && operand === 0) throw new Error('Cannot divide by zero.')
      value = operator === '*' ? value * operand : value / operand
    }
  }

  const parseExpression = (): number => {
    let value = parseTerm()
    while (true) {
      skipWhitespace()
      const operator = source[index]
      if (operator !== '+' && operator !== '-') return value
      index++
      const operand = parseTerm()
      value = operator === '+' ? value + operand : value - operand
    }
  }

  const result = parseExpression()
  skipWhitespace()
  if (index !== source.length) throw new Error('Use only numbers and calculator symbols.')
  if (!Number.isFinite(result)) throw new Error('That calculation is too large.')
  return Object.is(result, -0) ? 0 : Math.round(result * 10_000) / 10_000
}

export function AmountCalculator({
  label,
  value,
  disabled,
  onApply,
}: {
  label: string
  value: string
  disabled: boolean
  onApply: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState<number | null>(null)
  const [error, setError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()

  const close = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const open = () => {
    setExpression(value)
    setResult(null)
    setError('')
    setIsOpen(true)
  }

  const calculate = () => {
    try {
      const next = evaluateExpression(expression)
      if (next < 0) throw new Error('Budget amounts cannot be negative.')
      setResult(next)
      setError('')
    } catch (caught) {
      setResult(null)
      setError(caught instanceof Error ? caught.message : 'Unable to calculate that expression.')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    calculate()
  }

  const enter = (token: string) => {
    setExpression(current => current + token)
    setResult(null)
    setError('')
  }

  const keys = [
    { label: 'Clear', display: 'C', action: () => setExpression(''), className: 'calculator-clear' },
    { label: 'Left parenthesis', display: '(', value: '(' },
    { label: 'Right parenthesis', display: ')', value: ')' },
    { label: 'Divide', display: '÷', value: '÷', className: 'calculator-operator' },
    { label: 'Seven', display: '7', value: '7' },
    { label: 'Eight', display: '8', value: '8' },
    { label: 'Nine', display: '9', value: '9' },
    { label: 'Multiply', display: '×', value: '×', className: 'calculator-operator' },
    { label: 'Four', display: '4', value: '4' },
    { label: 'Five', display: '5', value: '5' },
    { label: 'Six', display: '6', value: '6' },
    { label: 'Subtract', display: '−', value: '−', className: 'calculator-operator' },
    { label: 'One', display: '1', value: '1' },
    { label: 'Two', display: '2', value: '2' },
    { label: 'Three', display: '3', value: '3' },
    { label: 'Add', display: '+', value: '+', className: 'calculator-operator' },
    { label: 'Zero', display: '0', value: '0' },
    { label: 'Decimal point', display: '.', value: '.' },
    {
      label: 'Backspace',
      display: '⌫',
      action: () => setExpression(current => current.slice(0, -1)),
    },
    { label: 'Equals', display: '=', action: calculate, className: 'calculator-equals' },
  ]

  return (
    <span className="amount-calculator" onKeyDown={event => {
      if (!isOpen || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }}>
      <button
        className="amount-calculator-trigger"
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={`Open calculator for ${label}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        aria-haspopup="dialog"
        title="Calculate an amount"
        onClick={open}
      ><AppIcon name="calculator" /></button>
      {isOpen && (
        <span className="amount-calculator-popover" id={popoverId} role="dialog" aria-label={`${label} calculator`}>
          <span className="amount-calculator-heading">
            <strong>Calculate amount</strong>
            <button
              className="text-button"
              type="button"
              aria-label="Close calculator"
              onClick={close}
            >Close</button>
          </span>
          <label>
            <span>Calculation</span>
            <input
              autoFocus
              inputMode="decimal"
              value={expression}
              placeholder="For example, 1200 / 12"
              onChange={event => {
                setExpression(event.target.value)
                setResult(null)
                setError('')
              }}
              onKeyDown={handleKeyDown}
            />
          </label>
          <span className="amount-calculator-keypad" aria-label="Calculator keypad">
            {keys.map(key => (
              <button
                className={key.className}
                type="button"
                aria-label={key.label}
                key={key.label}
                onClick={() => {
                  if (key.action) {
                    key.action()
                    if (key.display !== '=') {
                      setResult(null)
                      setError('')
                    }
                  } else if (key.value) {
                    enter(key.value)
                  }
                }}
              >{key.display}</button>
            ))}
          </span>
          {error && <small className="amount-calculator-error" role="alert">{error}</small>}
          {result !== null && <span className="amount-calculator-result" role="status">Result: <strong>{result}</strong></span>}
          <span className="amount-calculator-actions">
            <button
              className="primary-button"
              type="button"
              disabled={result === null}
              onClick={() => {
                if (result === null) return
                onApply(String(result))
                close()
              }}
            >Use result</button>
          </span>
        </span>
      )}
    </span>
  )
}
