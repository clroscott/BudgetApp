import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts } from '../accounts/accountApi'
import { HouseholdContext } from '../households/householdContext'
import { createImportProfile, getImportProfiles, inspectImportFile, type ImportProfileInspection } from '../imports/importProfileApi'
import { uploadCsvImport } from '../imports/importApi'
import { RouterProvider } from '../routing/RouterProvider'
import { householdsFixture, otherHousehold } from '../test/fixtures'
import { CsvImportPage } from './CsvImportPage'

vi.mock('../accounts/accountApi', async original => ({ ...await original<typeof import('../accounts/accountApi')>(), getAccounts: vi.fn() }))
vi.mock('../imports/importProfileApi', async original => ({ ...await original<typeof import('../imports/importProfileApi')>(),
  getImportProfiles: vi.fn(), inspectImportFile: vi.fn(), createImportProfile: vi.fn() }))
vi.mock('../imports/importApi', async original => ({ ...await original<typeof import('../imports/importApi')>(), uploadCsvImport: vi.fn() }))

const profile = { id: 'profile-a', name: 'Bank profile', headers: ['When', 'Vendor', 'Value'], dateColumn: 'When', descriptionColumn: 'Vendor', amountColumn: 'Value',
  debitColumn: null, creditColumn: null, categoryColumn: null, subcategoryColumn: null, amountConvention: 'SpendingPositive' as const,
  defaultAccountId: null, isActive: true, dateFormat: 'dd/MM/yyyy', numberCulture: 'de-DE' }
const sheets = [
  { id: '1', name: 'Chequing', isHidden: false, transactionRows: 3, problem: null },
  { id: '2', name: 'Savings', isHidden: false, transactionRows: 1, problem: null },
  { id: '3', name: 'Hidden', isHidden: true, transactionRows: 1, problem: null },
  { id: '4', name: 'Blank', isHidden: false, transactionRows: 0, problem: 'Blank worksheet.' },
]
function inspection(id: string | null = '1'): ImportProfileInspection {
  return { headers: id ? ['Date', 'Description', 'Amount'] : [], previewRows: id ? [['2026-07-20', '0012 merchant', '-12.3456']] : [],
    matchedProfile: null, suggestedProfile: null, worksheets: sheets,
    selectedWorksheetId: id, selectedWorksheetName: sheets.find(s => s.id === id)?.name ?? null, previewRowNumbers: id ? [8] : [] }
}
function tree(household = householdsFixture()) {
  return <RouterProvider><HouseholdContext.Provider value={household}><CsvImportPage /></HouseholdContext.Provider></RouterProvider>
}
async function selectFile(name = 'bank.xlsx') {
  const input = await screen.findByLabelText(/^CSV or Excel file/)
  const file = new File(['synthetic workbook'], name)
  fireEvent.change(input, { target: { files: [file] } })
  return { input, file }
}
beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/import')
  vi.mocked(getAccounts).mockResolvedValue([{ id: 'account-a', name: 'Chequing', type: 'Chequing', scope: 'Personal', ownerUserId: 'test-user',
    currency: 'CAD', institutionName: null, lastFourDigits: null, isActive: true }])
  vi.mocked(getImportProfiles).mockResolvedValue([])
  vi.mocked(inspectImportFile).mockResolvedValue(inspection())
  vi.mocked(uploadCsvImport).mockResolvedValue({ importFileId: 'import-a', originalFileName: 'bank.xlsx', accountName: 'Chequing', status: 'ReadyForReview',
    totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, sourceWorksheetName: 'Chequing' })
})

describe('Excel worksheet selection and staging', () => {
  it('does not claim accounts are absent when initial loading fails and can retry safely', async () => {
    vi.mocked(getAccounts).mockRejectedValueOnce(new Error('Accounts unavailable'))
    render(tree())
    await screen.findByRole('heading', { name: 'Could not load accounts and import profiles' })
    expect(screen.queryByRole('heading', { name: 'No active accounts' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByLabelText(/^CSV or Excel file/)
    expect(uploadCsvImport).not.toHaveBeenCalled()
  })
  it('previews the sole applicable worksheet and original row numbers before staging', async () => {
    render(tree())
    const { file } = await selectFile()
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    await screen.findByRole('region', { name: 'Import preview' })
    expect(uploadCsvImport).not.toHaveBeenCalled()
    expect(screen.getByRole('rowheader', { name: '8' })).toBeTruthy()
    expect(screen.getByText('0012 merchant')).toBeTruthy()
    expect(screen.getByText(/Formulas are never run/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Upload for review' }))
    await screen.findByRole('link', { name: 'Review this import' })
    expect(uploadCsvImport).toHaveBeenCalledWith('household-a', 'account-a', file, false, undefined, '1')
    expect(screen.getByText(/No official transactions were created/)).toBeTruthy()
  })

  it('requires an explicit choice for multiple sheets, labels hidden sheets and disables blank ones', async () => {
    vi.mocked(inspectImportFile).mockResolvedValueOnce(inspection(null)).mockResolvedValue(inspection('2'))
    render(tree())
    const { file } = await selectFile()
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    const select = await screen.findByLabelText('Worksheet')
    expect((screen.getByRole('button', { name: 'Upload for review' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('option', { name: /Blank worksheet/ }) as HTMLOptionElement).disabled).toBe(true)
    expect(screen.getByRole('option', { name: /Hidden \(hidden\)/ })).toBeTruthy()
    fireEvent.change(select, { target: { value: '2' } })
    await screen.findByText('Savings', { selector: 'strong' })
    expect(inspectImportFile).toHaveBeenLastCalledWith('household-a', 'account-a', file, '2')
    expect(uploadCsvImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Upload for review' }))
    await waitFor(() => expect(uploadCsvImport).toHaveBeenCalledWith('household-a', 'account-a', file, false, undefined, '2'))
  })

  it('reuses a saved CSV-compatible profile but still shows the Excel preview first', async () => {
    vi.mocked(getImportProfiles).mockResolvedValue([profile])
    vi.mocked(inspectImportFile).mockResolvedValue({ ...inspection(), headers: profile.headers, matchedProfile: profile })
    render(tree())
    const { file } = await selectFile()
    fireEvent.change(screen.getByLabelText(/^Import profile/), { target: { value: profile.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    await screen.findByLabelText('Worksheet')
    expect(uploadCsvImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Upload for review' }))
    await waitFor(() => expect(uploadCsvImport).toHaveBeenCalledWith('household-a', 'account-a', file, false, profile.id, '1'))
  })

  it('preserves the file/preview after failed staging and does not recreate a saved mapping on retry', async () => {
    vi.mocked(inspectImportFile).mockResolvedValue({ ...inspection(), headers: profile.headers, suggestedProfile: profile })
    vi.mocked(createImportProfile).mockResolvedValue(profile)
    vi.mocked(uploadCsvImport).mockRejectedValueOnce(new Error('Staging unavailable')).mockResolvedValue({ importFileId: 'import-a', originalFileName: 'bank.xlsx', accountName: 'Chequing',
      status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 })
    render(tree())
    await selectFile()
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    const save = await screen.findByRole('button', { name: 'Save profile and upload' })
    fireEvent.change(screen.getByLabelText('Text date format'), { target: { value: 'dd/MM/yyyy' } })
    fireEvent.change(screen.getByLabelText('Text number format'), { target: { value: 'de-DE' } })
    fireEvent.click(save)
    await screen.findByText('Staging unavailable')
    expect(createImportProfile).toHaveBeenCalledTimes(1)
    expect(createImportProfile).toHaveBeenCalledWith('household-a', expect.objectContaining({ dateFormat: 'dd/MM/yyyy', numberCulture: 'de-DE' }))
    expect(screen.getByRole('region', { name: 'Import preview' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Upload for review' }))
    await screen.findByRole('link', { name: 'Review this import' })
    expect(createImportProfile).toHaveBeenCalledTimes(1)
    expect(uploadCsvImport).toHaveBeenCalledTimes(2)
  })

  it('prevents concurrent reads and writes and keeps safe controls disabled during a request', async () => {
    let resolve!: (value: ImportProfileInspection) => void
    vi.mocked(inspectImportFile).mockReturnValue(new Promise(yes => { resolve = yes }))
    render(tree())
    const { input } = await selectFile()
    fireEvent.submit(input.closest('form')!)
    fireEvent.submit(input.closest('form')!)
    expect(inspectImportFile).toHaveBeenCalledTimes(1)
    expect((input as HTMLInputElement).disabled).toBe(true)
    await act(async () => resolve(inspection()))
    expect((input as HTMLInputElement).disabled).toBe(false)
    expect(uploadCsvImport).not.toHaveBeenCalled()
  })

  it('keeps a failed workbook selection protected and allows a read-only retry', async () => {
    vi.mocked(inspectImportFile).mockRejectedValueOnce(new Error('Workbook unavailable')).mockResolvedValue(inspection())
    render(tree())
    const { input } = await selectFile()
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    await screen.findByText('Workbook unavailable')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    expect((input as HTMLInputElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    await screen.findByLabelText('Worksheet')
    expect(uploadCsvImport).not.toHaveBeenCalled()
    expect(inspectImportFile).toHaveBeenCalledTimes(2)
  })

  it('does not let a Viewer save a shared profile for their private import', async () => {
    vi.mocked(inspectImportFile).mockResolvedValue({ ...inspection(), headers: profile.headers, suggestedProfile: profile })
    render(tree({ ...householdsFixture(), currentHousehold: { ...householdsFixture().currentHousehold!, role: 'Viewer' } }))
    await selectFile()
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    const save = await screen.findByRole('button', { name: 'Save profile and upload' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Only a household Owner or Admin can save/)).toBeTruthy()
    expect(createImportProfile).not.toHaveBeenCalled()
  })

  it('ignores late workbook reads after an accepted household change', async () => {
    let resolve!: (value: ImportProfileInspection) => void
    vi.mocked(inspectImportFile).mockReturnValue(new Promise(yes => { resolve = yes }))
    const view = render(tree())
    await selectFile()
    fireEvent.click(screen.getByRole('button', { name: 'Preview workbook' }))
    view.rerender(tree({ ...householdsFixture(), currentHousehold: otherHousehold }))
    await act(async () => resolve(inspection()))
    const form = await screen.findByLabelText(/^CSV or Excel file/)
    expect(within(form.closest('form')!).queryByText('Upload for review')).toBeTruthy()
    expect(screen.queryByLabelText('Worksheet')).toBeNull()
    expect(uploadCsvImport).not.toHaveBeenCalled()
  })

  it('keeps CSV standard uploads as one staging action without worksheet fields', async () => {
    vi.mocked(inspectImportFile).mockResolvedValue({ headers: ['Date', 'Description', 'Amount'], previewRows: [], matchedProfile: null, suggestedProfile: null })
    render(tree())
    const { file } = await selectFile('bank.csv')
    fireEvent.click(screen.getByRole('button', { name: 'Upload for review' }))
    await waitFor(() => expect(uploadCsvImport).toHaveBeenCalledWith('household-a', 'account-a', file, false))
    expect(screen.queryByLabelText('Worksheet')).toBeNull()
  })
})
