import { createContext } from 'react'
import type { NavigationGuard } from './navigationGuards'

export interface NavigateOptions {
  replace?: boolean
  bypassBlocker?: boolean
}

export interface RouterContextValue {
  path: string
  search: string
  hash: string
  navigate: (path: string, options?: NavigateOptions) => boolean
  confirmNavigation: () => boolean
  registerNavigationGuard: (guard: NavigationGuard) => () => void
}

export const RouterContext = createContext<RouterContextValue | null>(null)
