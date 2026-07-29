import { apiDelete, apiGet, apiPost, apiPut } from '../api/apiClient'

export type CategorizationRuleMatchOperator =
  | 'Contains'
  | 'StartsWith'
  | 'EndsWith'
  | 'Exact'

export interface CategorizationRuleItem {
  id: string
  name: string
  matchField: 'Description'
  matchOperator: CategorizationRuleMatchOperator
  matchValue: string
  accountId: string | null
  targetCategoryId: string
  priority: number
  isActive: boolean
}

export interface SaveCategorizationRuleRequest {
  name: string
  matchField: 'Description'
  matchOperator: CategorizationRuleMatchOperator
  matchValue: string
  accountId: string | null
  targetCategoryId: string
}

const basePath = (householdId: string) =>
  `/api/households/${householdId}/categorization-rules`

export function getCategorizationRules(
  householdId: string,
): Promise<CategorizationRuleItem[]> {
  return apiGet(basePath(householdId))
}

export function createCategorizationRule(
  householdId: string,
  request: SaveCategorizationRuleRequest,
): Promise<{ id: string }> {
  return apiPost(basePath(householdId), request)
}

export function updateCategorizationRule(
  householdId: string,
  ruleId: string,
  request: SaveCategorizationRuleRequest,
): Promise<void> {
  return apiPut(`${basePath(householdId)}/${ruleId}`, request)
}

export function reorderCategorizationRules(
  householdId: string,
  ruleIds: string[],
): Promise<void> {
  return apiPut(`${basePath(householdId)}/order`, { ruleIds })
}

export function setCategorizationRuleActive(
  householdId: string,
  ruleId: string,
  isActive: boolean,
): Promise<void> {
  return apiPost(
    `${basePath(householdId)}/${ruleId}/${isActive ? 'reactivate' : 'deactivate'}`,
    {},
  )
}

export function deleteCategorizationRule(
  householdId: string,
  ruleId: string,
): Promise<void> {
  return apiDelete(`${basePath(householdId)}/${ruleId}`)
}
