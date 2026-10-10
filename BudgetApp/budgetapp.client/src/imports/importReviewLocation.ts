import type { ImportListFilter } from './importApi'

export interface ImportReviewSelection { importId: string; filter: ImportListFilter; page: number }
export function readImportReviewLocation(search: string): ImportReviewSelection {
  const parameters = new URLSearchParams(search)
  const filter = parameters.get('filter')
  const page = Number(parameters.get('page'))
  return { importId: parameters.get('importId') ?? '',
    filter: filter === 'completed' || filter === 'all' || filter === 'ready' ? filter : 'inProgress',
    page: Number.isSafeInteger(page) && page >= 1 && page <= 2_147_483_647 ? page : 1 }
}
export function importReviewLocation(selection: ImportReviewSelection) {
  const parameters = new URLSearchParams()
  if (selection.importId) parameters.set('importId', selection.importId)
  if (selection.filter !== 'inProgress') parameters.set('filter', selection.filter)
  if (selection.page > 1) parameters.set('page', String(selection.page))
  return `/imports/review${parameters.size ? `?${parameters}` : ''}`
}
