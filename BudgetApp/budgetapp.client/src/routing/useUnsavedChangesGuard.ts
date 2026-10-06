import { useCallback, useLayoutEffect, useRef } from 'react'
import { useRouter } from './useRouter'

export function useUnsavedChangesGuard(isDirty: boolean, message: string) {
  const { registerNavigationGuard } = useRouter()
  const current = useRef({ isDirty, message })
  useLayoutEffect(() => { current.current = { isDirty, message } }, [isDirty, message])
  useLayoutEffect(() => registerNavigationGuard(() =>
    current.current.isDirty ? current.current.message : null,
  ), [registerNavigationGuard])

  // Local changes (switching the edited row, month, etc.) discard only this
  // editor. Route/household changes consult every registered editor instead.
  return useCallback(() => !current.current.isDirty ||
    window.confirm(current.current.message), [])
}
