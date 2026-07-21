import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { RouterContext } from './routerContext'

function currentPath(): string {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path || '/'
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const handlePopState = () => setPath(currentPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextPath: string, options?: { replace?: boolean }) => {
    const normalizedPath = nextPath.startsWith('/') ? nextPath : `/${nextPath}`

    if (options?.replace) {
      window.history.replaceState(null, '', normalizedPath)
    } else {
      window.history.pushState(null, '', normalizedPath)
    }

    setPath(currentPath())
  }, [])

  const value = useMemo(() => ({ path, navigate }), [navigate, path])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}
