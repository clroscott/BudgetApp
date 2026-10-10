import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { RouterContext, type NavigateOptions } from './routerContext'
import { createNavigationGuards, type NavigationGuard } from './navigationGuards'

const historyIndexKey = '__budgetappNavigationIndex'
function historyIndex(): number | null {
  const index = window.history.state?.[historyIndexKey]
  return Number.isInteger(index) ? index : null
}
function historyState(index: number) {
  const previous = window.history.state
  return { ...(previous && typeof previous === 'object' ? previous : {}), [historyIndexKey]: index }
}

function currentLocation() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return { path: path || '/', search: window.location.search, hash: window.location.hash }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation)
  const guards = useMemo(createNavigationGuards, [])
  const indexRef = useRef(historyIndex() ?? 0)
  const restoringRef = useRef(false)
  const currentUrlRef = useRef(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  )

  const registerNavigationGuard = useCallback((guard: NavigationGuard) =>
    guards.register(guard), [guards])
  const confirmNavigation = useCallback(() => {
    if (restoringRef.current) return false
    const message = guards.message()
    return !message || window.confirm(message)
  }, [guards])

  useLayoutEffect(() => {
    window.history.replaceState(historyState(indexRef.current), '')
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      if (restoringRef.current) {
        restoringRef.current = false
        return
      }
      const nextIndex = historyIndex()
      if (!confirmNavigation()) {
        if (nextIndex !== null && nextIndex !== indexRef.current) {
          // Restore the existing entry rather than push a duplicate and erase
          // Forward history when the user chooses to stay.
          restoringRef.current = true
          window.history.go(indexRef.current - nextIndex)
        } else {
          window.history.replaceState(historyState(indexRef.current), '', currentUrlRef.current)
        }
        return
      }

      indexRef.current = nextIndex ?? indexRef.current
      window.history.replaceState(historyState(indexRef.current), '')
      currentUrlRef.current =
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      setLocation(currentLocation())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [confirmNavigation])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guards.message()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [guards])

  const navigate = useCallback((nextPath: string, options?: NavigateOptions) => {
    // Even an automatic URL replacement must not overwrite a canceled history
    // traversal while the browser is returning to the accepted entry.
    if (restoringRef.current) return false
    const normalizedPath = nextPath.startsWith('/') ? nextPath : `/${nextPath}`
    const currentUrl =
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (normalizedPath === currentUrl) return true

    if (
      normalizedPath !== currentUrl &&
      !options?.bypassBlocker &&
      !confirmNavigation()
    ) {
      return false
    }

    if (options?.replace) {
      window.history.replaceState(historyState(indexRef.current), '', normalizedPath)
    } else {
      indexRef.current += 1
      window.history.pushState(historyState(indexRef.current), '', normalizedPath)
    }

    currentUrlRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    setLocation(currentLocation())
    return true
  }, [confirmNavigation])

  const value = useMemo(
    () => ({ ...location, navigate, confirmNavigation, registerNavigationGuard }),
    [confirmNavigation, navigate, location, registerNavigationGuard],
  )
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}
