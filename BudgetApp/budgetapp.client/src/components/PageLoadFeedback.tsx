import type { PageLoadStatus } from '../pages/usePageLoad'

export function PageLoadFeedback({ subject, status, errors, onReload, disabled = false }: {
  subject: string, status: PageLoadStatus, errors: string[], onReload: () => void, disabled?: boolean,
}) {
  if (status === 'ready') return <div className="page-load-actions">
    <button className="text-button" type="button" disabled={disabled} onClick={onReload}>Refresh data</button>
  </div>
  if (status === 'loading' || status === 'refreshing') return <p className="empty-state" role="status">
    {status === 'refreshing' ? 'Refreshing' : 'Loading'} {subject}…
    {status === 'refreshing' && ' Previously loaded data remains visible.'}
  </p>
  return <section className="error-summary page-load-feedback" role="alert" aria-label={`${subject} load status`}>
    <h2>Could not {status === 'stale' ? 'refresh' : 'load'} {subject}</h2>
    <p>{status === 'stale'
      ? 'Previously loaded data is shown below and may be out of date. Changes are unavailable until it is refreshed.'
      : 'The data is unavailable. This does not mean there are no records.'}</p>
    {errors.map(error => <p key={error}>{error}</p>)}
    <button className="secondary-button" type="button" disabled={disabled} onClick={onReload}>Retry loading</button>
  </section>
}
