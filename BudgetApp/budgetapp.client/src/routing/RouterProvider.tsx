import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { RouterContext, type NavigateOptions } from './routerContext'

function currentPath(): string {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path || '/'
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath)
  const blockerRef = useRef<(() => boolean) | null>(null)
  const currentUrlRef = useRef(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  )

  const setNavigationBlocker = useCallback(
    (blocker: (() => boolean) | null) => {
      blockerRef.current = blocker
    },
    [],
  )
  const confirmNavigation = useCallback(
    () => !blockerRef.current || blockerRef.current(),
    [],
  )

  useEffect(() => {
    const handlePopState = () => {
      if (blockerRef.current && !blockerRef.current()) {
        window.history.pushState(null, '', currentUrlRef.current)
        return
      }

      currentUrlRef.current =
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      setPath(currentPath())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextPath: string, options?: NavigateOptions) => {
    const normalizedPath = nextPath.startsWith('/') ? nextPath : `/${nextPath}`
    const currentUrl =
      `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (
      normalizedPath !== currentUrl &&
      !options?.bypassBlocker &&
      !confirmNavigation()
    ) {
      return false
    }

    if (options?.replace) {
      window.history.replaceState(null, '', normalizedPath)
    } else {
      window.history.pushState(null, '', normalizedPath)
    }

    currentUrlRef.current = normalizedPath
    setPath(currentPath())
    return true
  }, [confirmNavigation])

  const value = useMemo(
    () => ({ path, navigate, confirmNavigation, setNavigationBlocker }),
    [confirmNavigation, navigate, path, setNavigationBlocker],
  )
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}
