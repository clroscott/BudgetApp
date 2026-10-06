import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { householdsFixture } from '../test/fixtures'
import { getCategories } from '../categories/categoryApi'
import { getAccounts } from '../accounts/accountApi'
import { getImportProfiles, inspectImportFile } from '../imports/importProfileApi'
import { getImports, getImport, getImportCategorizationRulePreview, bulkUpdateImportDrafts,
  uploadCsvImport, type ImportListItem, type ImportReviewDetail } from '../imports/importApi'
import { ImportReviewPage } from './ImportReviewPage'
import { CsvImportPage } from './CsvImportPage'

vi.mock('../categories/categoryApi', async original => ({
  ...await original<typeof import('../categories/categoryApi')>(), getCategories: vi.fn(),
}))
vi.mock('../accounts/accountApi', async original => ({
  ...await original<typeof import('../accounts/accountApi')>(), getAccounts: vi.fn(),
}))
vi.mock('../imports/importProfileApi', async original => ({
  ...await original<typeof import('../imports/importProfileApi')>(), getImportProfiles: vi.fn(), inspectImportFile: vi.fn(),
}))
vi.mock('../imports/importApi', async original => ({
  ...await original<typeof import('../imports/importApi')>(), getImports: vi.fn(), getImport: vi.fn(),
  getImportCategorizationRulePreview: vi.fn(), bulkUpdateImportDrafts: vi.fn(), uploadCsvImport: vi.fn(),
}))

const listItem: ImportListItem = {
  id: 'import-a', originalFileName: 'sample.csv', accountName: 'Sample account',
  status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0,
  approvedRows: 0, excludedRows: 0, duplicateRows: 0, uploadedAtUtc: '2026-01-01', canEdit: true,
}
function detail(): ImportReviewDetail {
  return { ...listItem, currency: 'CAD', drafts: [{
    id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-01-01', amount: 100,
    description: 'Original description', importedCategoryName: null, importedSubcategoryName: null,
    selectedCategoryId: 'housing', validationStatus: 'Valid', validationMessage: null,
    duplicateStatus: 'NotDuplicate', possibleMatchingTransactionId: null,
    reviewDecision: 'Pending', isDuplicateAcknowledged: false, approvedTransactionId: null,
  }] }
}
function Routes({ children }: { children: ReactNode }) {
  const { path } = useRouter()
  return path === '/dashboard' ? <p>Destination</p> : <>{children}<AppLink to="/dashboard">Leave page</AppLink></>
}
function show(page: ReactNode, path = '/imports/review?importId=import-a') {
  window.history.replaceState(null, '', path)
  return render(<RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
    <Routes>{page}</Routes>
  </HouseholdContext.Provider></RouterProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCategories).mockResolvedValue([{ id: 'housing', name: 'Housing', type: 'Expense',
    displayOrder: 0, isActive: true, children: [] }])
  vi.mocked(getAccounts).mockResolvedValue([{ id: 'account-a', name: 'Sample account', type: 'Chequing',
    scope: 'Household', ownerUserId: null, currency: 'CAD', institutionName: null,
    lastFourDigits: null, isActive: true }])
  vi.mocked(getImportProfiles).mockResolvedValue([])
  vi.mocked(getImports).mockResolvedValue([listItem, { ...listItem, id: 'import-b', originalFileName: 'other.csv' }])
  vi.mocked(getImport).mockResolvedValue(detail())
  vi.mocked(getImportCategorizationRulePreview).mockResolvedValue({
    fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0,
  })
})

describe('staged import edit protection', () => {
  it('canceled route/import/filter changes keep corrections and the selected import', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Unsaved correction' } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Import'), { target: { value: 'import-b' } })
    expect((screen.getByLabelText('Import') as HTMLSelectElement).value).toBe('import-a')
    fireEvent.change(screen.getByLabelText('Show imports'), { target: { value: 'completed' } })
    expect((screen.getByLabelText('Show imports') as HTMLSelectElement).value).toBe('inProgress')
    fireEvent.change(screen.getByLabelText('Show rows'), { target: { value: 'uncategorized' } })
    expect((screen.getByLabelText('Show rows') as HTMLSelectElement).value).toBe('all')
    expect(input.value).toBe('Unsaved correction')
    expect(window.confirm).toHaveBeenCalledTimes(4)
  })
  it('failed bulk saving retains corrections and protection; successful saving clears it', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Unsaved correction' } })
    vi.mocked(bulkUpdateImportDrafts).mockRejectedValueOnce(new Error('Sample correction failure'))
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('Sample correction failure')
    expect(input.value).toBe('Unsaved correction')
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    const saved = detail()
    saved.drafts[0].description = 'Unsaved correction'
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Destination')).toBeTruthy()
  })
  it('preserves an explicitly cleared category across row hiding and reappearance', async () => {
    show(<ImportReviewPage />)
    await screen.findByLabelText('Description')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(screen.getByLabelText('Show rows'), { target: { value: 'uncategorized' } })
    expect(screen.queryByLabelText('Description')).toBeNull()
    fireEvent.change(screen.getByLabelText('Show rows'), { target: { value: 'all' } })
    expect((await screen.findByLabelText('Category') as HTMLSelectElement).value).toBe('')
  })
  it('protects rule-editor changes before leaving or closing that editor', async () => {
    show(<ImportReviewPage />)
    await screen.findByLabelText('Description')
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }))
    const match = await screen.findByLabelText('Match text') as HTMLInputElement
    fireEvent.change(match, { target: { value: 'Changed match text' } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(match.value).toBe('Changed match text')
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })
  it('does not silently refresh away a dirty row', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Unsaved correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(input.value).toBe('Unsaved correction')
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
})

describe('pending CSV uploads', () => {
  it.each(['profile-a', 'profile/other?download=true#"><img data-url-injection src=x>'])
  ('renders a safe template link for selected profile %s', async profileId => {
    vi.mocked(getImportProfiles).mockResolvedValue([{
      id: profileId, name: 'Sample CSV profile', headers: ['Date', 'Description', 'Amount'],
      dateColumn: 'Date', descriptionColumn: 'Description', amountColumn: 'Amount',
      debitColumn: null, creditColumn: null, categoryColumn: null, subcategoryColumn: null,
      amountConvention: 'SpendingPositive', defaultAccountId: null, isActive: true,
    }])
    show(<CsvImportPage />, '/import')
    await screen.findByRole('option', { name: 'Sample CSV profile' })
    fireEvent.change(screen.getByLabelText(/^CSV profile/), { target: { value: profileId } })
    const link = await screen.findByRole('link', { name: 'Download selected profile template' })
    expect(link.getAttribute('href'))
      .toBe(`/api/households/household-a/import-profiles/${encodeURIComponent(profileId)}/template`)
    const url = new URL((link as HTMLAnchorElement).href)
    expect(url.origin).toBe(window.location.origin)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    expect(document.querySelector('[data-url-injection]')).toBeNull()
  })

  it('protects a selected file before upload and clears protection after a successful upload', async () => {
    show(<CsvImportPage />, '/import')
    const fileInput = await screen.findByLabelText(/^CSV file/)
    fireEvent.change(fileInput, { target: { files: [new File(['Date,Description,Amount\n2026-01-01,Sample,100'], 'sample.csv', { type: 'text/csv' })] } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    vi.mocked(inspectImportFile).mockResolvedValue({
      headers: ['Date', 'Description', 'Amount'], matchedProfile: null,
    } as Awaited<ReturnType<typeof inspectImportFile>>)
    vi.mocked(uploadCsvImport).mockResolvedValue({ importFileId: 'import-a', originalFileName: 'sample.csv',
      accountName: 'Sample account', status: 'ReadyForReview', totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 })
    fireEvent.submit(fileInput.closest('form')!)
    await waitFor(() => expect(uploadCsvImport).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('link', { name: /Review/i })).toBeTruthy())
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Destination')).toBeTruthy()
  })
})
