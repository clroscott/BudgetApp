import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { getErrorMessages } from '../auth/errorMessages'

export type PageLoadStatus = 'loading' | 'refreshing' | 'ready' | 'failed' | 'stale'
interface LoadState {
  key: string
  status: PageLoadStatus
  hasData: boolean
  errors: string[]
}

// Keep data in the page (including its editable form), and manage read feedback
// separately from save errors. Late responses cannot overwrite another context.
export function usePageLoad(contextKey: string) {
  const [state, setState] = useState<LoadState>({ key: contextKey, status: 'loading', hasData: false, errors: [] })
  const currentKey = useRef(contextKey)
  currentKey.current = contextKey
  const sequence = useRef(0)
  const mounted = useRef(true)
  const cancelRequests = useCallback(() => { mounted.current = false; sequence.current++ }, [])
  useEffect(() => {
    mounted.current = true
    return cancelRequests
  }, [contextKey, cancelRequests])

  const run = useCallback(async <T,>(read: () => Promise<T>, apply: (data: T) => void) => {
    if (!mounted.current || currentKey.current !== contextKey) return false
    const attempt = ++sequence.current
    const isCurrent = () => mounted.current && currentKey.current === contextKey && sequence.current === attempt
    setState(previous => {
      const hasData = previous.key === contextKey && previous.hasData
      return { key: contextKey, status: hasData ? 'refreshing' : 'loading', hasData, errors: [] }
    })
    try {
      const data = await read()
      if (!isCurrent()) return false
      apply(data)
      setState({ key: contextKey, status: 'ready', hasData: true, errors: [] })
      return true
    } catch (error) {
      if (!isCurrent()) return false
      setState(previous => {
        // Never show retained records after access is revoked or they are gone.
        const inaccessible = error instanceof ApiError && [401, 403, 404].includes(error.status)
        const hasData = previous.key === contextKey && previous.hasData && !inaccessible
        return { key: contextKey, status: hasData ? 'stale' : 'failed', hasData, errors: getErrorMessages(error) }
      })
      return false
    }
  }, [contextKey])

  const markReady = useCallback(() => {
    if (!mounted.current || currentKey.current !== contextKey) return
    sequence.current++
    setState({ key: contextKey, status: 'ready', hasData: true, errors: [] })
  }, [contextKey])
  const invalidate = useCallback(() => {
    if (!mounted.current || currentKey.current !== contextKey) return
    sequence.current++
    setState({ key: contextKey, status: 'loading', hasData: false, errors: [] })
  }, [contextKey])
  const status = state.key === contextKey ? state.status : 'loading'
  return {
    status, hasData: state.key === contextKey && state.hasData,
    isFresh: status === 'ready', isPending: status === 'loading' || status === 'refreshing',
    errors: state.key === contextKey ? state.errors : [], run, markReady, invalidate,
  }
}
