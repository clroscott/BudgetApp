import { beforeEach, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '../api/apiClient'
import { getImportReversalPreview, reverseImport } from './importApi'

vi.mock('../api/apiClient', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('uses a cancellable GET with a page and validates the import ID before sending', async () => {
  const id = '11111111-1111-1111-1111-111111111111'
  const signal = new AbortController().signal
  await getImportReversalPreview('household-a', id, 2, signal)
  expect(apiGet).toHaveBeenCalledWith(`/api/households/household-a/imports/${id}/reversal-preview?page=2`, signal)
  expect(() => getImportReversalPreview('household-a', 'invalid')).toThrow('This import link is invalid.')
  expect(apiGet).toHaveBeenCalledTimes(1)
})

it('uses the existing anti-forgery POST boundary with explicit confirmation and the preview version', async () => {
  const id = '11111111-1111-1111-1111-111111111111'
  await reverseImport('home-a', id, 'A'.repeat(64))
  expect(apiPost).toHaveBeenCalledExactlyOnceWith(`/api/households/home-a/imports/${id}/reverse`, {
    previewVersion: 'A'.repeat(64), confirmed: true,
  })
  expect(() => reverseImport('home-a', 'invalid', 'A'.repeat(64))).toThrow()
})
