import { createContext } from 'react'

export interface NavigateOptions {
  replace?: boolean
}

export interface RouterContextValue {
  path: string
  navigate: (path: string, options?: NavigateOptions) => void
}

export const RouterContext = createContext<RouterContextValue | null>(null)
