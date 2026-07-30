import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  getAuditEvents,
  type AuditEventItem,
  type AuditFilterOptions,
  type AuditQuery,
} from '../auditing/auditApi'
import { ApiError } from '../api/apiClient'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'

const emptyFilters: AuditFilterOptions = {
  actors: [],
  actions: [],
  entityTypes: [],
}

const initialQuery: AuditQuery = { page: 1 }

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function displayEntityType(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function ActivityPage() {
  const { currentHousehold } = useHouseholds()
  const [draftQuery, setDraftQuery] = useState<AuditQuery>(initialQuery)
  const [appliedQuery, setAppliedQuery] = useState<AuditQuery>(initialQuery)
  const [events, setEvents] = useState<AuditEventItem[]>([])
  const [filters, setFilters] = useState<AuditFilterOptions>(emptyFilters)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!currentHousehold) return

    setIsLoading(true)
    setErrors([])
    try {
      const result = await getAuditEvents(currentHousehold.id, appliedQuery)
      setEvents(result.items)
      setFilters(result.filters)
      setTotalCount(result.totalCount)
      setTotalPages(result.totalPages)
    } catch (error) {
      setErrors([
        error instanceof ApiError
          ? error.message
          : 'Activity history could not be loaded.',
      ])
    } finally {
      setIsLoading(false)
    }
  }, [appliedQuery, currentHousehold])

  useEffect(() => {
    void load()
  }, [load])

  function applyFilters(event: FormEvent) {
    event.preventDefault()
    setAppliedQuery({ ...draftQuery, page: 1 })
  }

  function resetFilters() {
    setDraftQuery(initialQuery)
    setAppliedQuery(initialQuery)
  }

  function changePage(page: number) {
    setDraftQuery(current => ({ ...current, page }))
    setAppliedQuery(current => ({ ...current, page }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="management-page">
      <section className="management-content activity-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Household</p>
            <h1>Activity</h1>
            <p>
              See meaningful changes to household data and your own personal
              finances. Other members&apos; personal activity remains private.
            </p>
          </div>
        </div>

        <ErrorSummary errors={errors} />

        <form className="activity-filter-panel" onSubmit={applyFilters}>
          <div className="activity-filter-grid">
            <label>
              From
              <input
                type="date"
                value={draftQuery.fromDate ?? ''}
                onChange={event => setDraftQuery(current => ({
                  ...current,
                  fromDate: event.target.value || undefined,
                }))}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={draftQuery.toDate ?? ''}
                onChange={event => setDraftQuery(current => ({
                  ...current,
                  toDate: event.target.value || undefined,
                }))}
              />
            </label>
            <label>
              Person
              <select
                value={draftQuery.actorUserId ?? ''}
                onChange={event => setDraftQuery(current => ({
                  ...current,
                  actorUserId: event.target.value || undefined,
                }))}
              >
                <option value="">Everyone visible to me</option>
                {filters.actors.map(actor => (
                  <option value={actor.userId} key={actor.userId}>
                    {actor.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Action
              <select
                value={draftQuery.action ?? ''}
                onChange={event => setDraftQuery(current => ({
                  ...current,
                  action: event.target.value || undefined,
                }))}
              >
                <option value="">All actions</option>
                {filters.actions.map(action => (
                  <option value={action} key={action}>{action}</option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={draftQuery.entityType ?? ''}
                onChange={event => setDraftQuery(current => ({
                  ...current,
                  entityType: event.target.value || undefined,
                }))}
              >
                <option value="">All types</option>
                {filters.entityTypes.map(entityType => (
                  <option value={entityType} key={entityType}>
                    {displayEntityType(entityType)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="activity-filter-actions">
            <button type="submit">Apply filters</button>
            <button
              className="secondary-button"
              type="button"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          </div>
        </form>

        {!isLoading && (
          <p className="activity-result-summary">
            {totalCount === 1 ? '1 visible event' : `${totalCount} visible events`}
          </p>
        )}

        {isLoading ? (
          <p className="empty-state">Loading activity...</p>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <h2>No activity found</h2>
            <p>There are no visible events matching these filters.</p>
          </div>
        ) : (
          <div className="activity-list">
            {events.map(auditEvent => {
              const detailEntries = Object.entries(auditEvent.details)
              return (
                <article className="activity-card" key={auditEvent.id}>
                  <div className="activity-card-heading">
                    <div>
                      <div className="activity-card-meta">
                        <span>{auditEvent.actorDisplayName}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={auditEvent.occurredAtUtc}>
                          {formatTimestamp(auditEvent.occurredAtUtc)}
                        </time>
                      </div>
                      <h2>{auditEvent.summary}</h2>
                    </div>
                    <div className="activity-badges">
                      <span>{auditEvent.action}</span>
                      <span>{displayEntityType(auditEvent.entityType)}</span>
                      {auditEvent.visibility === 'Personal' && (
                        <span className="activity-personal-badge">Personal</span>
                      )}
                    </div>
                  </div>
                  {detailEntries.length > 0 && (
                    <details className="activity-details">
                      <summary>View details</summary>
                      <dl>
                        {detailEntries.map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value ?? '(none)'}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <nav className="transaction-pagination" aria-label="Activity pages">
            <button
              className="secondary-button"
              type="button"
              disabled={(appliedQuery.page ?? 1) <= 1}
              onClick={() => changePage((appliedQuery.page ?? 1) - 1)}
            >
              Previous
            </button>
            <span>Page {appliedQuery.page ?? 1} of {totalPages}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={(appliedQuery.page ?? 1) >= totalPages}
              onClick={() => changePage((appliedQuery.page ?? 1) + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </main>
  )
}
