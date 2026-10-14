import type { ImportDraftItem, ImportDraftFilter, ImportDraftPageResult, ImportDraftMutationResult, ImportReviewDetail } from './importApi'

export interface ImportReviewPageData extends ImportReviewDetail {
  loadedHouseholdId?: string
  counts: ImportDraftPageResult['summary']['counts']
  updatedAtUtc: string
  page: number; totalCount: number; totalPages: number
}

export function reviewPageData(result: ImportDraftPageResult): ImportReviewPageData {
  return { ...result.summary, ...result.summary.counts, drafts: result.items,
    page: result.page, totalCount: result.totalCount, totalPages: result.totalPages }
}

export function matchesDraftFilter(draft: ImportDraftItem, filter: ImportDraftFilter, parents: ReadonlySet<string>) {
  switch (filter) {
    case 'pending': return draft.reviewDecision === 'Pending'
    case 'uncategorized': return !draft.selectedCategoryId
    case 'parentOnly': return Boolean(draft.selectedCategoryId && parents.has(draft.selectedCategoryId))
    case 'categorized': return Boolean(draft.selectedCategoryId)
    case 'possibleDuplicates': return draft.duplicateStatus === 'PossibleDuplicate'
    case 'invalid': return draft.validationStatus === 'Invalid'
    case 'approved': return draft.reviewDecision === 'Approved'
    case 'excluded': return draft.reviewDecision === 'Excluded'
    default: return true
  }
}

export function mergeDraftChanges(current: ImportReviewPageData, result: ImportDraftMutationResult): ImportReviewPageData {
  const changes = new Map(result.items.map(item => [item.id, item]))
  const removed = new Set(result.removedDraftIds)
  return { ...current, ...result.summary, ...result.summary.counts,
    drafts: current.drafts.filter(item => !removed.has(item.id)).map(item => changes.get(item.id) ?? item) }
}
