import type { CategoryItem, CategoryType } from '../categories/categoryApi'
import type { TransactionQuery } from './transactionApi'

export type DateFilterMode = 'pastDays' | 'specificDate' | 'specificMonth' | 'range' | 'all'
export const uncategorizedFilterValue = '__uncategorized__'
export interface TransactionFilters {
  accountId: string
  dateMode: DateFilterMode
  pastDays: string
  specificDate: string
  specificMonth: string
  fromDate: string
  toDate: string
  categoryType: CategoryType | ''
  categoryId: string
  subcategoryId: string
  description: string
  budgetInclusion: string
  currency: string
  spendingOnly: boolean
}

function formatLocalDate(date: Date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
export function createDefaultFilters(today = new Date()): TransactionFilters {
  return {
    accountId: '', budgetInclusion: '', currency: '', spendingOnly: false,
    dateMode: 'pastDays', pastDays: '30', specificDate: formatLocalDate(today),
    specificMonth: formatLocalDate(today).slice(0, 7), fromDate: formatLocalDate(addDays(today, -29)),
    toDate: formatLocalDate(today), categoryType: '', categoryId: '', subcategoryId: '', description: '',
  }
}
export function createInitialFilters(): TransactionFilters {
  const defaults = createDefaultFilters()
  const search = new URLSearchParams(window.location.search)
  defaults.budgetInclusion = search.get('budgetInclusion') ?? ''
  defaults.currency = search.get('currency') ?? ''
  defaults.spendingOnly = search.get('spendingOnly') === 'true'
  const fromDate = search.get('fromDate') ?? ''
  const toDate = search.get('toDate') ?? ''
  if (!fromDate || !toDate) return defaults
  return { ...defaults, dateMode: 'range', fromDate, toDate,
    categoryId: search.get('uncategorizedOnly') === 'true' ? uncategorizedFilterValue : search.get('categoryId') ?? '' }
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return Number.isFinite(date.getTime()) && formatLocalDate(date) === value && date.getFullYear() >= 1
}
export function buildTransactionQuery(filters: TransactionFilters, page: number, today = new Date()): TransactionQuery {
  const query: TransactionQuery = {
    accountId: filters.accountId || undefined, budgetInclusion: filters.budgetInclusion || undefined,
    currency: filters.currency || undefined, spendingOnly: filters.spendingOnly || undefined,
    categoryType: filters.categoryType || undefined,
    categoryId: filters.categoryId === uncategorizedFilterValue ? undefined : filters.subcategoryId || filters.categoryId || undefined,
    uncategorizedOnly: filters.categoryId === uncategorizedFilterValue || undefined,
    description: filters.description.trim() || undefined, page,
  }
  if (filters.dateMode === 'pastDays') {
    const days = Number(filters.pastDays)
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Past days must be a whole number between 1 and 3,650.')
    query.fromDate = formatLocalDate(addDays(today, -(days - 1)))
    query.toDate = formatLocalDate(today)
  } else if (filters.dateMode === 'specificDate') {
    if (!validDate(filters.specificDate)) throw new Error('Choose a valid specific date.')
    query.fromDate = query.toDate = filters.specificDate
  } else if (filters.dateMode === 'specificMonth') {
    if (!validDate(`${filters.specificMonth}-01`)) throw new Error('Choose a valid specific month.')
    const [year, month] = filters.specificMonth.split('-').map(Number)
    const end = new Date(0)
    end.setHours(12, 0, 0, 0)
    end.setFullYear(year, month, 0)
    query.fromDate = `${filters.specificMonth}-01`
    query.toDate = formatLocalDate(end)
  } else if (filters.dateMode === 'range') {
    if (!validDate(filters.fromDate) || !validDate(filters.toDate)) throw new Error('Choose both a valid start date and an end date.')
    if (filters.fromDate > filters.toDate) throw new Error('Start date cannot be after end date.')
    query.fromDate = filters.fromDate
    query.toDate = filters.toDate
  } else if (filters.dateMode !== 'all') throw new Error('Date filter is not supported.')
  return query
}

// Clear irrelevant date fields; the rolling mode stays rolling when reopened later.
export function storedFilterIntent(filters: TransactionFilters): TransactionFilters {
  return { accountId: filters.accountId, dateMode: filters.dateMode,
    pastDays: filters.dateMode === 'pastDays' ? String(Number(filters.pastDays)) : '',
    specificDate: filters.dateMode === 'specificDate' ? filters.specificDate : '',
    specificMonth: filters.dateMode === 'specificMonth' ? filters.specificMonth : '',
    fromDate: filters.dateMode === 'range' ? filters.fromDate : '',
    toDate: filters.dateMode === 'range' ? filters.toDate : '',
    categoryType: filters.categoryType, categoryId: filters.categoryId, subcategoryId: filters.subcategoryId,
    description: filters.description.trim(), budgetInclusion: filters.budgetInclusion,
    currency: filters.currency, spendingOnly: filters.spendingOnly }
}
export function filterIntentKey(filters: TransactionFilters) {
  return JSON.stringify(storedFilterIntent(filters))
}
export function resolveFilterCategory(filters: TransactionFilters, categories: CategoryItem[]) {
  const selected = filters.subcategoryId || filters.categoryId
  for (const root of categories) {
    if (root.id === selected) return { ...filters, categoryId: root.id, subcategoryId: '' }
    if (root.children.some(child => child.id === selected)) return { ...filters, categoryId: root.id, subcategoryId: selected }
  }
  return filters // Never turn an unavailable reference into an unrestricted search.
}
