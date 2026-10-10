import type { TransactionQuery } from './transactionApi'

export function buildTransactionParameters(query: TransactionQuery): URLSearchParams {
  const parameters = new URLSearchParams()
  if (query.budgetInclusion) parameters.set('budgetInclusion', query.budgetInclusion)
  if (query.currency) parameters.set('currency', query.currency)
  if (query.spendingOnly) parameters.set('spendingOnly', 'true')
  if (query.accountId) parameters.set('accountId', query.accountId)
  if (query.fromDate) parameters.set('fromDate', query.fromDate)
  if (query.toDate) parameters.set('toDate', query.toDate)
  if (query.categoryType) parameters.set('categoryType', query.categoryType)
  if (query.categoryId) parameters.set('categoryId', query.categoryId)
  if (query.uncategorizedOnly) parameters.set('uncategorizedOnly', 'true')
  if (query.description) parameters.set('description', query.description)
  return parameters
}
