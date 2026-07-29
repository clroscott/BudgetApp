import { apiGet, apiPut } from '../api/apiClient'

export interface TransactionItem {
  id: string
  accountId: string
  accountName: string
  currency: string
  categoryId: string | null
  categoryName: string | null
  transactionDate: string
  postedDate: string | null
  amount: number
  description: string
  merchantName: string | null
  notes: string | null
  source: string
  reviewStatus: string
  isExcludedFromBudget: boolean
  isVoided: boolean
  canEdit: boolean
}

export interface TransactionListResult {
  items: TransactionItem[]
  hasMore: boolean
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface TransactionQuery {
  accountId?: string
  fromDate?: string
  toDate?: string
  categoryType?: string
  categoryId?: string
  uncategorizedOnly?: boolean
  description?: string
  page: number
}

export interface UpdateTransactionRequest {
  categoryId: string | null
  transactionDate: string
  postedDate: string | null
  amount: number
  description: string
  merchantName: string | null
  notes: string | null
  isExcludedFromBudget: boolean
}

export function getTransactions(
  householdId: string,
  query: TransactionQuery,
): Promise<TransactionListResult> {
  const parameters = new URLSearchParams()
  if (query.accountId) parameters.set('accountId', query.accountId)
  if (query.fromDate) parameters.set('fromDate', query.fromDate)
  if (query.toDate) parameters.set('toDate', query.toDate)
  if (query.categoryType) parameters.set('categoryType', query.categoryType)
  if (query.categoryId) parameters.set('categoryId', query.categoryId)
  if (query.uncategorizedOnly) parameters.set('uncategorizedOnly', 'true')
  if (query.description) parameters.set('description', query.description)
  parameters.set('page', query.page.toString())
  return apiGet(`/api/households/${householdId}/transactions?${parameters}`)
}

export function updateTransaction(
  householdId: string,
  transactionId: string,
  request: UpdateTransactionRequest,
): Promise<void> {
  return apiPut(
    `/api/households/${householdId}/transactions/${transactionId}`,
    request,
  )
}
