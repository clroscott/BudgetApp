import { useCallback, useRef, useState, type FormEvent } from 'react'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

export function useUnsavedForm<T>(value: T, message: string) {
  const [saved, setSaved] = useState(() => JSON.stringify(value))
  const isDirty = JSON.stringify(value) !== saved
  const confirmDiscard = useUnsavedChangesGuard(isDirty, message)
  const markClean = useCallback((next: T) => setSaved(JSON.stringify(next)), [])
  return { isDirty, confirmDiscard, markClean }
}

function formSnapshot(form: HTMLFormElement) {
  const values: Array<[string, string | [string, number, number]]> = []
  new FormData(form).forEach((value, name) => {
    values.push([name, typeof value === 'string' ? value : [value.name, value.size, value.lastModified]])
  })
  return JSON.stringify(values)
}

// Existing create forms use native FormData rather than controlled React inputs.
// Capture their initial values, not just a "touched" flag, so undoing an edit
// returns the form to clean state. Values stay in memory, never browser storage.
export function useUnsavedNativeForm(message: string) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const saved = useRef('')
  const [isDirty, setIsDirty] = useState(false)
  const confirmDiscard = useUnsavedChangesGuard(isDirty, message)
  const ref = useCallback((form: HTMLFormElement | null) => {
    formRef.current = form
    if (form) saved.current = formSnapshot(form)
  }, [])
  const onChange = useCallback((event: FormEvent<HTMLFormElement>) => {
    setIsDirty(formSnapshot(event.currentTarget) !== saved.current)
  }, [])
  const markClean = useCallback(() => {
    if (formRef.current) saved.current = formSnapshot(formRef.current)
    setIsDirty(false)
  }, [])
  return { formProps: { ref, onChange }, isDirty, confirmDiscard, markClean }
}
