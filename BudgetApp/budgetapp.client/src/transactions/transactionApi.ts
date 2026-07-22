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
  accountId?: string,
): Promise<TransactionListResult> {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
  return apiGet(`/api/households/${householdId}/transactions${query}`)
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
