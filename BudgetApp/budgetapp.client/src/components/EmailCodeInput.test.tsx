import { useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmailCodeInput } from './EmailCodeInput'
import { VerificationCodeFields } from './VerificationCodeFields'
import type { VerificationProof } from '../auth/loginVerificationApi'

function Harness({ disabled = false }: { disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  return <><label htmlFor="email-code">Email code</label><p id="code-help">Enter six digits.</p>
    <EmailCodeInput id="email-code" inputRef={input} value={value} onChange={setValue} disabled={disabled} describedBy="code-help" />
    <button type="button">Next control</button></>
}
function paste(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } })
}
function show(disabled = false) {
  const result = render(<Harness disabled={disabled} />)
  return { ...result, input: screen.getByRole('textbox', { name: 'Email code' }) as HTMLInputElement }
}
describe('six-box email code input', () => {
  it('has six decorative boxes but one labeled native input for editing and autofill', () => {
    const { input, container } = show()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(container.querySelectorAll('.email-code-slot')).toHaveLength(6)
    expect(container.querySelector('.email-code-slots')?.getAttribute('aria-hidden')).toBe('true')
    expect(input.getAttribute('autocomplete')).toBe('one-time-code')
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('aria-describedby')).toBe('code-help')
    expect(input.checkValidity()).toBe(false)
    fireEvent.change(input, { target: { value: '001234' } })
    expect(input.checkValidity()).toBe(true)
    expect(Array.from(container.querySelectorAll('.email-code-slot'), slot => slot.textContent).join('')).toBe('001234')
  })
  it('pastes a complete code with leading zeros and replaces an existing code', async () => {
    const { input } = show()
    fireEvent.change(input, { target: { value: '999999' } })
    input.setSelectionRange(2, 2)
    paste(input, '001234')
    await act(async () => {})
    expect(input.value).toBe('001234')
    expect(input.selectionStart).toBe(6)
    expect(input.selectionEnd).toBe(6)
  })
  it('accepts copied whitespace/hyphens without truncating the six digits', () => {
    const { input } = show()
    paste(input, ' 001-234\n')
    expect(input.value).toBe('001234')
  })
  it('pastes a partial code at the current selection', async () => {
    const { input } = show()
    fireEvent.change(input, { target: { value: '001234' } })
    input.setSelectionRange(2, 4)
    paste(input, '98')
    await act(async () => {})
    expect(input.value).toBe('009834')
    expect(input.selectionStart).toBe(4)
  })
  it('rejects longer or nonnumeric pastes instead of extracting or truncating a code', () => {
    const { input } = show()
    paste(input, '12345678')
    expect(input.value).toBe('')
    expect(screen.getByRole('alert').textContent).toMatch(/six-digit code/)
    paste(input, 'Your code is 123456')
    expect(input.value).toBe('')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.checkValidity()).toBe(false)
    paste(input, '123456')
    expect(input.value).toBe('123456')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.checkValidity()).toBe(true)
  })
  it('supports partial entry, deletion, replacement, and visible selection without adding tab stops', () => {
    const { input, container } = show()
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '012' } })
    expect(container.querySelectorAll('.is-current')).toHaveLength(1)
    fireEvent.change(input, { target: { value: '01' } })
    expect(input.value).toBe('01')
    fireEvent.change(input, { target: { value: '019876' } })
    act(() => input.select())
    fireEvent.select(input)
    expect(container.querySelectorAll('.is-selected')).toHaveLength(6)
    fireEvent.change(input, { target: { value: '654321' } })
    expect(input.value).toBe('654321')
    fireEvent.change(input, { target: { value: '' } })
    expect(container.querySelector('.email-code-caret')).toBeTruthy()
    expect(container.querySelector('.email-code-slots')?.querySelectorAll('input,button,[tabindex]')).toHaveLength(0)
  })
  it('rejects unsupported typed/autofilled values and never edits while disabled', () => {
    const { input } = show(true)
    expect(input.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '123456' } })
    expect(input.value).toBe('')
  })
  it('rejects a seventh digit or letters but accepts a six-digit autofill value', () => {
    const { input } = show()
    fireEvent.change(input, { target: { value: '1234567' } })
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: '12x456' } })
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: '012345' } })
    expect(input.value).toBe('012345')
  })
  it('keeps recovery codes full-length and restores focus when switching entry modes', () => {
    function Fields() {
      const [proof, setProof] = useState<VerificationProof>({ challengeId: 'a', code: '', useRecoveryCode: false })
      return <VerificationCodeFields challenge={{ challengeId: 'a', delivered: true,
        expiresAtUtc: new Date(Date.now() + 300000).toISOString(), resendAtUtc: new Date().toISOString(),
        challengeExpiresAtUtc: new Date(Date.now() + 600000).toISOString() }} proof={proof} onChange={setProof} disabled={false} onResend={() => {}} />
    }
    const { container } = render(<Fields />)
    fireEvent.click(screen.getByLabelText('Use a recovery code instead'))
    const recovery = screen.getByLabelText('Recovery code') as HTMLInputElement
    expect(document.activeElement).toBe(recovery)
    fireEvent.change(recovery, { target: { value: 'AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD' } })
    expect(recovery.value).toBe('AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD')
    expect(container.querySelector('.email-code-slots')).toBeNull()
    fireEvent.click(screen.getByLabelText('Use a recovery code instead'))
    const email = screen.getByLabelText('Email verification code') as HTMLInputElement
    expect(email.value).toBe('')
    expect(document.activeElement).toBe(email)
    expect(container.querySelectorAll('.email-code-slot')).toHaveLength(6)
  })
})
