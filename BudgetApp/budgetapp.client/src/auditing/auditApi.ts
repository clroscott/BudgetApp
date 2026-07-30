import { apiGet } from '../api/apiClient'

export interface AuditEventItem {
  id: string
  actorUserId: string
  actorDisplayName: string
  visibility: 'Household' | 'Personal'
  occurredAtUtc: string
  action: string
  entityType: string
  entityId: string
  summary: string
  details: Record<string, string | null>
}

export interface AuditActorOption {
  userId: string
  displayName: string
}

export interface AuditFilterOptions {
  actors: AuditActorOption[]
  actions: string[]
  entityTypes: string[]
}

export interface AuditEventListResult {
  items: AuditEventItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  filters: AuditFilterOptions
}

export interface AuditQuery {
  fromDate?: string
  toDate?: string
  actorUserId?: string
  action?: string
  entityType?: string
  page?: number
}

export function getAuditEvents(
  householdId: string,
  query: AuditQuery,
): Promise<AuditEventListResult> {
  const parameters = new URLSearchParams()
  if (query.fromDate) parameters.set('fromDate', query.fromDate)
  if (query.toDate) parameters.set('toDate', query.toDate)
  if (query.actorUserId) parameters.set('actorUserId', query.actorUserId)
  if (query.action) parameters.set('action', query.action)
  if (query.entityType) parameters.set('entityType', query.entityType)
  parameters.set('page', String(query.page ?? 1))

  return apiGet<AuditEventListResult>(
    `/api/households/${householdId}/audit-events?${parameters.toString()}`,
  )
}
