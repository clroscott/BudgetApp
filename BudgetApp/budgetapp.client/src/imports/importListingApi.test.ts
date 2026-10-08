import { beforeEach, expect, it, vi } from 'vitest'
import { apiGet } from '../api/apiClient'
import { getImport, getImports, getImportSummary } from './importApi'

vi.mock('../api/apiClient', () => ({ apiGet: vi.fn(), apiDelete: vi.fn(), apiPost: vi.fn(), apiPostForm: vi.fn(), apiPut: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it.each([
  ['inProgress', 'Unfinished'], ['completed', 'Completed'], ['all', 'All'], ['ready', 'ReadyForReview'],
] as const)('sends the %s filter and import-file page to the server', async (filter, expected) => {
  await getImports('household-a', filter, 2)
  expect(apiGet).toHaveBeenCalledWith(`/api/households/household-a/imports?filter=${expected}&page=2`)
})

it('loads exact counts without downloading an import metadata page', async () => {
  await getImportSummary('household-a')
  expect(apiGet).toHaveBeenCalledExactlyOnceWith('/api/households/household-a/imports/summary')
})

it.each(['summary', '../summary', 'not-an-import'])('rejects malformed deep-linked import ID %s', async id => {
  await expect(getImport('household-a', id)).rejects.toThrow('This import link is invalid')
  expect(apiGet).not.toHaveBeenCalled()
})

it('keeps a valid direct lookup independent of list filter and page', async () => {
  const id = '12345678-1234-1234-1234-123456789abc'
  await getImport('household-a', id)
  expect(apiGet).toHaveBeenCalledWith(`/api/households/household-a/imports/${id}`)
})
