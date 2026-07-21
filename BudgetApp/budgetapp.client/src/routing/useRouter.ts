import { useContext } from 'react'
import { RouterContext, type RouterContextValue } from './routerContext'

export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext)

  if (!context) {
    throw new Error('useRouter must be used inside RouterProvider.')
  }

  return context
}
