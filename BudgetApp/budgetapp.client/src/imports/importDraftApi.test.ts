import { beforeEach, expect, it, vi } from 'vitest'
import { apiGet, apiPost, apiPut, apiDelete } from '../api/apiClient'
import { getImportDraftPage, getBudgetChoicePreview, saveImportDraft, saveImportDrafts, decideImportDraft, deleteImportDraft } from './importApi'

vi.mock('../api/apiClient', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(), apiPostForm: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
const id = '11111111-1111-1111-1111-111111111111'
const root = `/api/households/hh/imports/${id}`
const version = '2026-10-14T12:00:00.0000001+00:00'
const query = `returnChanges=true&expectedImportUpdatedAtUtc=${encodeURIComponent(version)}`
const update = { transactionDate: '2026-10-01', amount: -12.3456, description: 'Synthetic', selectedCategoryId: null }

it.each([['all', 'All'], ['pending', 'Pending'], ['parentOnly', 'ParentOnly'], ['possibleDuplicates', 'PossibleDuplicates']] as const)(
  'reads only the requested %s draft page, with cancellation', async (filter, serverFilter) => {
    const signal = new AbortController().signal
    await getImportDraftPage('hh', id, filter, 2, signal)
    expect(apiGet).toHaveBeenCalledExactlyOnceWith(`${root}/drafts?filter=${serverFilter}&page=2`, signal)
  })
it('rejects malformed paged import links before any request', async () => {
  await expect(getImportDraftPage('hh', 'summary', 'all', 1)).rejects.toThrow('This import link is invalid')
  expect(apiGet).not.toHaveBeenCalled()
})
it('requests a read-only bulk preview with filter, pending row IDs and the exact version', async () => {
  await getBudgetChoicePreview('hh', id, 'uncategorized', true, false, ['row-a'], version)
  expect(apiPost).toHaveBeenCalledExactlyOnceWith(`${root}/budget-choice-preview`, {
    filter: 'Uncategorized', personal: true, household: false, editedDraftIds: ['row-a'], expectedImportUpdatedAtUtc: version,
  })
})
it('uses targeted change responses and preserves all timestamp precision for each command', async () => {
  await saveImportDraft('hh', id, 'row-a', update, version)
  expect(apiPut).toHaveBeenLastCalledWith(`${root}/drafts/row-a?${query}`, update)
  await saveImportDrafts('hh', id, [{ ...update, draftId: 'row-a' }], version)
  expect(apiPut).toHaveBeenLastCalledWith(`${root}/drafts?${query}`, { drafts: [{ ...update, draftId: 'row-a' }] })
  await decideImportDraft('hh', id, 'row-a', 'Approved', true, version)
  expect(apiPost).toHaveBeenLastCalledWith(`${root}/drafts/row-a/decision?${query}`, { decision: 'Approved', acknowledgePossibleDuplicate: true })
  await deleteImportDraft('hh', id, 'row-a', version)
  expect(apiDelete).toHaveBeenLastCalledWith(`${root}/drafts/row-a?${query}`)
})
