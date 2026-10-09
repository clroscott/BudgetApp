import { useCallback, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { useReadOwner } from '../api/useReadOwner'
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
  const owner = useReadOwner(contextKey)

  const run = useCallback(async <T,>(read: (signal: AbortSignal) => Promise<T>, apply: (data: T) => void) => {
    const attempt = owner.begin()
    if (!attempt) return false
    setState(previous => {
      const hasData = previous.key === contextKey && previous.hasData
      return { key: contextKey, status: hasData ? 'refreshing' : 'loading', hasData, errors: [] }
    })
    try {
      const data = await read(attempt.signal)
      if (!attempt.isCurrent()) return false
      apply(data)
      setState({ key: contextKey, status: 'ready', hasData: true, errors: [] })
      return true
    } catch (error) {
      if (!attempt.isCurrent()) return false
      setState(previous => {
        // Never show retained records after access is revoked or they are gone.
        const inaccessible = error instanceof ApiError && [401, 403, 404].includes(error.status)
        const hasData = previous.key === contextKey && previous.hasData && !inaccessible
        return { key: contextKey, status: hasData ? 'stale' : 'failed', hasData, errors: getErrorMessages(error) }
      })
      return false
    } finally { attempt.finish() }
  }, [contextKey, owner])

  const markReady = useCallback(() => {
    if (!owner.isContextCurrent()) return
    owner.invalidate()
    setState({ key: contextKey, status: 'ready', hasData: true, errors: [] })
  }, [contextKey, owner])
  const invalidate = useCallback(() => {
    if (!owner.isContextCurrent()) return
    owner.invalidate()
    setState({ key: contextKey, status: 'loading', hasData: false, errors: [] })
  }, [contextKey, owner])
  const status = state.key === contextKey ? state.status : 'loading'
  return {
    status, hasData: state.key === contextKey && state.hasData,
    isFresh: status === 'ready', isPending: status === 'loading' || status === 'refreshing',
    errors: state.key === contextKey ? state.errors : [], run, markReady, invalidate,
    captureContext: owner.captureContext, isContextCurrent: owner.isContextCurrent,
  }
}
