import { createContext } from 'react'

export interface NavigateOptions {
  replace?: boolean
  bypassBlocker?: boolean
}

export interface RouterContextValue {
  path: string
  navigate: (path: string, options?: NavigateOptions) => boolean
  confirmNavigation: () => boolean
  setNavigationBlocker: (blocker: (() => boolean) | null) => void
}

export const RouterContext = createContext<RouterContextValue | null>(null)
