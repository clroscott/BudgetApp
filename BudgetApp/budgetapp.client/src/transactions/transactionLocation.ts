import type { TransactionQuery } from './transactionApi'
import { buildTransactionParameters } from './transactionQuery'
import { buildTransactionQuery, createInitialFilters, storedFilterIntent, type TransactionFilters } from './transactionFilters'
import { readAnnualReportContext } from './reportContext'

type ReportContext = NonNullable<ReturnType<typeof readAnnualReportContext>>

// The same query model feeds reads, exports, presets and report reconciliation.
// URL-only fields describe control intent and the original report, not new API filters.
export function readTransactionLocation(search: string) {
  const filters = createInitialFilters(search)
  const parameters = new URLSearchParams(search)
  let query: TransactionQuery | null = null
  let error: string | null = null
  try {
    const page = Number(parameters.get('page') ?? '1')
    if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) throw new Error('Choose a valid transaction page.')
    if (filters.categoryType && !['Expense', 'Income', 'Transfer'].includes(filters.categoryType)) throw new Error('Choose a valid category type.')
    if (filters.budgetInclusion && !['Personal', 'Household', 'PersonalAndHousehold', 'NotIncluded'].includes(filters.budgetInclusion)) throw new Error('Choose a valid budget inclusion.')
    if (filters.currency && !/^[A-Z]{3}$/.test(filters.currency)) throw new Error('Currency must be a three-letter uppercase code.')
    query = buildTransactionQuery(filters, page)
    // Keep the exact applied dates when traversing history, including a rolling
    // preset applied on a previous day. Applying it again calculates fresh dates.
    if (filters.dateMode === 'pastDays' && (parameters.has('fromDate') || parameters.has('toDate'))) {
      const range = buildTransactionQuery({ ...filters, dateMode: 'range',
        fromDate: parameters.get('fromDate') ?? '', toDate: parameters.get('toDate') ?? '' }, page)
      query.fromDate = range.fromDate
      query.toDate = range.toDate
    }
  } catch (failure) {
    query = null
    error = failure instanceof Error ? failure.message : 'The transaction filters could not be read.'
  }
  let reportContext: ReportContext | null = null
  if (parameters.has('reportFilters')) {
    try {
      const original = buildTransactionQuery(createInitialFilters(parameters.get('reportFilters')!), 1)
      reportContext = readAnnualReportContext(search, original)
    } catch { /* An invalid source report must never claim reconciliation. */ }
  } else if (query) reportContext = readAnnualReportContext(search, query)
  return { filters, query, reportContext, error }
}

export function transactionFilterLocation(filters: TransactionFilters, page: number,
  report: ReportContext | null, appliedQuery = buildTransactionQuery(filters, page)) {
  const parameters = buildTransactionParameters(appliedQuery)
  const intent = storedFilterIntent(filters)
  parameters.set('dateMode', intent.dateMode)
  for (const key of ['pastDays', 'specificDate', 'specificMonth', 'subcategoryId'] as const) {
    if (intent[key]) parameters.set(key, intent[key])
  }
  if (page > 1) parameters.set('page', String(page))
  if (report) {
    parameters.set('report', 'annual-overview')
    parameters.set('reportYear', String(report.year))
    parameters.set('reportHouseholdId', report.householdId)
    parameters.set('reportFilters', buildTransactionParameters(report.query).toString())
  }
  return `/transactions?${parameters}`
}
