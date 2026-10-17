import { PageFrame } from '../components/PageFrame'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  getAuditEvents,
  type AuditEventItem,
  type AuditFilterOptions,
  type AuditQuery,
} from '../auditing/auditApi'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useReadTutorialPage } from '../tutorials/readTutorialState'
import { HouseholdSectionNav } from '../components/HouseholdSectionNav'
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
  const loadState = usePageLoad(`${currentHousehold?.id}/${JSON.stringify(appliedQuery)}`)
  const { run } = loadState
  useReadTutorialPage(loadState.isFresh)

  const load = useCallback(async () => {
    if (!currentHousehold) return

    await run(() => getAuditEvents(currentHousehold.id, appliedQuery), result => {
      setEvents(result.items)
      setFilters(result.filters)
      setTotalCount(result.totalCount)
      setTotalPages(result.totalPages)
    })
  }, [appliedQuery, currentHousehold, run])

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
    <PageFrame contentClassName="activity-content" footer={<div id="read-tutorial-guide-host" />}>
        <HouseholdSectionNav current="activity" />
        <div className="page-title-row" data-tutorial-id="activity-tour-title">
          <div>
            <p className="eyebrow">Household</p>
            <h1>Change history</h1>
            <p>
              See meaningful changes to household data and your own personal
              finances. Other members&apos; personal activity remains private.
            </p>
          </div>
        </div>

        <PageLoadFeedback subject="change history" status={loadState.status} errors={loadState.errors} onReload={() => void load()} />

        <form className="activity-filter-panel" data-tutorial-id="activity-tour-form" onSubmit={applyFilters}>
          <div className="activity-filter-grid">
            <label>
              From
              <input
                data-tutorial-id="activity-tour-from"
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
                data-tutorial-id="activity-tour-to"
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
                data-tutorial-id="activity-tour-person"
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
                data-tutorial-id="activity-tour-action"
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
                data-tutorial-id="activity-tour-type"
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
            <button type="submit" data-tutorial-id="activity-tour-apply">Apply filters</button>
            <button
              className="secondary-button"
              type="button"
              onClick={resetFilters}
              data-tutorial-id="activity-tour-reset"
            >
              Reset filters
            </button>
          </div>
        </form>

        {loadState.hasData && (
          <p className="activity-result-summary" data-tutorial-id="activity-tour-count">
            {totalCount === 1 ? '1 visible event' : `${totalCount} visible events`}
          </p>
        )}

        {!loadState.hasData ? null : events.length === 0 ? (
          <div className="empty-state" data-tutorial-id="activity-tour-empty">
            <h2>No activity found</h2>
            <p>There are no visible events matching these filters.</p>
          </div>
        ) : (
          <div className="activity-list">
            {events.map((auditEvent, index) => {
              const detailEntries = Object.entries(auditEvent.details)
              return (
                <article className="activity-card" key={auditEvent.id} data-tutorial-id={index === 0 ? 'activity-tour-entry' : undefined}>
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
                      <summary data-tutorial-id="activity-tour-details">View details</summary>
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

        {loadState.hasData && totalPages > 1 && (
          <nav className="transaction-pagination" aria-label="Activity pages" data-tutorial-id="activity-tour-pages">
            <button
              className="secondary-button"
              type="button"
              disabled={(appliedQuery.page ?? 1) <= 1}
              data-tutorial-id="activity-tour-previous"
              onClick={() => changePage((appliedQuery.page ?? 1) - 1)}
            >
              Previous
            </button>
            <span>Page {appliedQuery.page ?? 1} of {totalPages}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={(appliedQuery.page ?? 1) >= totalPages}
              data-tutorial-id="activity-tour-next"
              onClick={() => changePage((appliedQuery.page ?? 1) + 1)}
            >
              Next
            </button>
          </nav>
        )}
    </PageFrame>
  )
}
