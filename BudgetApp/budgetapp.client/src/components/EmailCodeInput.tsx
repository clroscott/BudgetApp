import { useState, type RefObject } from 'react'

// One real input preserves native editing, autofill, and a single screen-reader
// label/tab stop. The six decorative cells are not separate form controls.
export function EmailCodeInput({ id, inputRef, value, onChange, disabled, describedBy }: {
  id: string; inputRef: RefObject<HTMLInputElement | null>; value: string
  onChange: (value: string) => void; disabled: boolean; describedBy: string
}) {
  const [focused, setFocused] = useState(false)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [error, setError] = useState('')
  const readSelection = (input: HTMLInputElement) => setSelection({ start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 })
  const accept = (text: string) => {
    if (disabled) return null
    const code = text.replace(/[\s-]/g, '')
    if (!/^[0-9]{0,6}$/.test(code)) {
      const message = 'Enter or paste a six-digit code using numbers only.'
      inputRef.current?.setCustomValidity(message)
      setError(message)
      return null
    }
    inputRef.current?.setCustomValidity('')
    setError(''); onChange(code)
    return code
  }
  const active = Math.min(selection.start, value.length, 5)
  return <>
    <div className={`email-code-input${disabled ? ' is-disabled' : ''}`}>
      <div className="email-code-slots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => {
          const selected = focused && index >= selection.start && index < Math.min(selection.end, value.length)
          const current = focused && selection.start === selection.end && index === active
          return <span key={index} className={`email-code-slot${current ? ' is-current' : ''}${selected ? ' is-selected' : ''}`}>
            {value[index] ?? ''}{current && !value[index] && <span className="email-code-caret" />}
          </span>
        })}
      </div>
      <input ref={inputRef} id={id} type="text" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" required value={value} disabled={disabled} spellCheck={false}
        aria-describedby={`${describedBy}${error ? ` ${id}-error` : ''}`} aria-invalid={error ? true : undefined}
        onFocus={event => { setFocused(true); readSelection(event.currentTarget) }} onBlur={() => setFocused(false)}
        onSelect={event => readSelection(event.currentTarget)}
        onChange={event => {
          const code = accept(event.currentTarget.value)
          if (code !== null) {
            const position = Math.min(event.currentTarget.selectionStart ?? code.length, code.length)
            setSelection({ start: position, end: position })
          }
        }}
        onPaste={event => {
          event.preventDefault()
          const input = event.currentTarget
          const pasted = event.clipboardData.getData('text').replace(/[\s-]/g, '')
          // A whole code replaces the previous code; partial pastes respect the
          // current caret/selection. Never silently truncate a longer code.
          const full = /^[0-9]{6}$/.test(pasted)
          const start = input.selectionStart ?? value.length
          const end = input.selectionEnd ?? start
          const code = accept(full ? pasted : value.slice(0, start) + pasted + value.slice(end))
          if (code !== null) {
            const position = full ? 6 : start + pasted.length
            setSelection({ start: position, end: position })
            queueMicrotask(() => input.setSelectionRange(position, position))
          }
        }}
        onPointerDown={event => {
          if (disabled || event.button !== 0) return
          event.preventDefault()
          const input = event.currentTarget
          const bounds = input.getBoundingClientRect()
          const position = Math.max(0, Math.min(5, Math.floor((event.clientX - bounds.left) / bounds.width * 6), value.length))
          input.focus(); input.setSelectionRange(position, Math.min(position + 1, value.length)); readSelection(input)
        }}
        onDoubleClick={event => { event.currentTarget.select(); readSelection(event.currentTarget) }} />
    </div>
    {error && <p id={`${id}-error`} className="field-help" role="alert">{error}</p>}
  </>
}
