import type { ImportReviewDetail, ImportDraftFilter, ImportDraftPageResult, ImportDraftUpdate, ImportDraftMutationResult } from '../imports/importApi'
import { matchesDraftFilter } from '../imports/importReviewState'

// Adapt full synthetic fixtures to the real bounded HTTP contract. This helper
// belongs to tests only; production must never fetch the legacy full batch.
export function draftPageFixture(batch: ImportReviewDetail, filter: ImportDraftFilter = 'all', page = 1, parents = new Set<string>()): ImportDraftPageResult {
  const drafts = batch.drafts.filter(draft => matchesDraftFilter(draft, filter, parents))
  const actualPage = Math.min(page, Math.max(1, Math.ceil(drafts.length / 100)))
  return {
    summary: { ...batch, updatedAtUtc: '2026-10-14T12:00:00.0000000+00:00', counts: {
      totalRows: batch.totalRows, validRows: batch.validRows, invalidRows: batch.invalidRows,
      approvedRows: batch.approvedRows, excludedRows: batch.excludedRows, duplicateRows: batch.duplicateRows,
      pendingRows: batch.totalRows - batch.approvedRows - batch.excludedRows,
      uncheckedDuplicateRows: batch.drafts.filter(draft => draft.duplicateStatus === 'NotChecked').length,
      validPendingRows: batch.drafts.filter(draft => draft.validationStatus === 'Valid' && draft.reviewDecision === 'Pending').length,
    } },
    items: drafts.slice((actualPage - 1) * 100, actualPage * 100), filter,
    page: actualPage, pageSize: 100, totalCount: drafts.length, totalPages: Math.ceil(drafts.length / 100),
  }
}

export function mutationFixture(batch: ImportReviewDetail, updates: ImportDraftUpdate[]): ImportDraftMutationResult {
  const byId = new Map(updates.map(update => [update.draftId, update]))
  const drafts = batch.drafts.map(draft => byId.has(draft.id) ? { ...draft, ...byId.get(draft.id), reviewDecision: 'Pending' } : draft)
  return { summary: { ...draftPageFixture({ ...batch, drafts }).summary, updatedAtUtc: '2026-10-14T12:00:00.0000001+00:00' },
    items: drafts.filter(draft => byId.has(draft.id)), removedDraftIds: [], savedRows: updates.length }
}
