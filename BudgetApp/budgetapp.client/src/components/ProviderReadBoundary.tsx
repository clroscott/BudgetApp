import type { ReactNode } from 'react'
import { PageLoadFeedback } from './PageLoadFeedback'

// Retain the editor DOM during a same-context provider refresh/failure. Unknown
// initial data still uses the route's blocking screen; revoked access removes it.
export function ProviderReadBoundary({ children, subject, pending, error, onRetry }: {
  children: ReactNode, subject: string, pending: boolean, error: string | null, onRetry: () => void,
}) {
  return <div className="provider-read-boundary">
    {(pending || error) && <PageLoadFeedback subject={subject} status={pending ? 'refreshing' : 'stale'}
      errors={error ? [error] : []} onReload={onRetry} />}
    <div inert={pending || Boolean(error)}>{children}</div>
  </div>
}
