import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'

// Ownership is the correctness guarantee; aborting is only a resource saving.
// Some readers/mocks ignore AbortSignal, so always check isCurrent before applying.
export function useReadOwner(contextKey: string) {
  const key = useRef(contextKey)
  const mounted = useRef(false)
  const contextVersion = useRef(0)
  const sequence = useRef(0)
  const active = useRef<AbortController | null>(null)
  const invalidate = useCallback(() => {
    sequence.current++
    active.current?.abort()
    active.current = null
  }, [])
  const disposeContext = useCallback(() => {
    mounted.current = false
    contextVersion.current++
    invalidate()
  }, [invalidate])
  useLayoutEffect(() => {
    key.current = contextKey
    mounted.current = true
    contextVersion.current++
    invalidate()
    return disposeContext
  }, [contextKey, disposeContext, invalidate])
  const isContextCurrent = useCallback(() => mounted.current && key.current === contextKey, [contextKey])
  const captureContext = useCallback(() => {
    const version = contextVersion.current
    return () => isContextCurrent() && contextVersion.current === version
  }, [isContextCurrent])
  const begin = useCallback(() => {
    if (!isContextCurrent()) return null
    invalidate()
    const controller = new AbortController()
    active.current = controller
    const attempt = sequence.current
    const stillInContext = captureContext()
    return {
      signal: controller.signal,
      isCurrent: () => stillInContext() && sequence.current === attempt && !controller.signal.aborted,
      finish: () => { if (sequence.current === attempt) active.current = null },
    }
  }, [captureContext, invalidate, isContextCurrent])
  const hasPending = useCallback(() => isContextCurrent() && active.current !== null, [isContextCurrent])
  return useMemo(() => ({ begin, invalidate, captureContext, isContextCurrent, hasPending }),
    [begin, invalidate, captureContext, isContextCurrent, hasPending])
}
