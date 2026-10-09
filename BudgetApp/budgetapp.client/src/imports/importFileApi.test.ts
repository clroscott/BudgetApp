import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPostForm } from '../api/apiClient'
import { uploadCsvImport } from './importApi'
import { inspectImportFile } from './importProfileApi'

vi.mock('../api/apiClient', () => ({ apiPostForm: vi.fn(async () => ({})) }))
beforeEach(() => vi.clearAllMocks())

describe('shared CSV/Excel multipart contract', () => {
  it('includes the explicit worksheet and profile only when requested for staging', async () => {
    const file = new File(['synthetic'], 'bank.xlsx')
    await uploadCsvImport('household-a', 'account-a', file, false, 'profile-a', '2')
    const [url, body] = vi.mocked(apiPostForm).mock.calls[0]
    expect(url).toBe('/api/households/household-a/imports')
    expect(body.get('file')).toBe(file)
    expect(body.get('accountId')).toBe('account-a')
    expect(body.get('profileId')).toBe('profile-a')
    expect(body.get('worksheetId')).toBe('2')
    expect(body.get('allowDuplicateFile')).toBe('false')
  })
  it('keeps existing CSV staging free of worksheet parameters', async () => {
    await uploadCsvImport('household-a', 'account-a', new File(['Date,Description,Amount'], 'bank.csv'), true)
    const body = vi.mocked(apiPostForm).mock.calls[0][1]
    expect(body.has('worksheetId')).toBe(false)
    expect(body.has('profileId')).toBe(false)
    expect(body.get('allowDuplicateFile')).toBe('true')
  })
  it('uses the same inspect endpoint to select and preview an Excel worksheet', async () => {
    const file = new File(['synthetic'], 'bank.xlsx')
    await inspectImportFile('household/a', 'account-a', file, '2')
    const [url, body] = vi.mocked(apiPostForm).mock.calls[0]
    expect(url).toBe('/api/households/household%2Fa/import-profiles/inspect')
    expect(body.get('worksheetId')).toBe('2')
    expect(body.get('file')).toBe(file)
  })
  it('omits worksheet selection for the initial workbook survey and for CSV inspection', async () => {
    await inspectImportFile('household-a', 'account-a', new File(['synthetic'], 'bank.xlsx'))
    expect(vi.mocked(apiPostForm).mock.calls[0][1].has('worksheetId')).toBe(false)
  })
})
