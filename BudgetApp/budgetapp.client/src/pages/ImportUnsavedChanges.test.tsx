import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('bulk choices preserve row corrections, support cancellation, and save through the existing bulk endpoint', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    // Rows can render while the initial load still disables editing. Wait for
    // readiness and the dirty cache before testing preservation by bulk choices.
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'My correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    fireEvent.change(screen.getByLabelText('Bulk budget inclusion'), { target: { value: 'PersonalAndHousehold' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply budget choices (1)' }))
    expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(false)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apply budget choices (1)' }))
    await waitFor(() => expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(true))
    expect(input.value).toBe('My correction')
    expect(bulkUpdateImportDrafts).not.toHaveBeenCalled()
    const saved = detail()
    saved.drafts[0] = { ...saved.drafts[0], description: 'My correction', includeInHouseholdBudget: true, includeInPersonalBudget: true }
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockRejectedValueOnce(new Error('Bulk save failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('Bulk save failed')
    expect(input.value).toBe('My correction')
    expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(true)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenLastCalledWith('household-a', 'import-a', [
      expect.objectContaining({ draftId: 'row-a', description: 'My correction', includeInHouseholdBudget: true, includeInPersonalBudget: true }),
    ])
  })
  it('bulk choices honor the row filter and skip excluded or permission-protected rows', async () => {
    const batch = detail()
    batch.totalRows = 4
    batch.drafts = [batch.drafts[0],
      { ...batch.drafts[0], id: 'approved', reviewDecision: 'Approved' },
      { ...batch.drafts[0], id: 'excluded', reviewDecision: 'Excluded' },
      { ...batch.drafts[0], id: 'protected', canChangePersonalInclusion: false }]
    vi.mocked(getImport).mockResolvedValue(batch)
    show(<ImportReviewPage />)
    await screen.findByLabelText('Bulk budget inclusion')
    fireEvent.change(screen.getByLabelText('Show rows'), { target: { value: 'pending' } })
    fireEvent.change(screen.getByLabelText('Bulk budget inclusion'), { target: { value: 'Personal' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apply budget choices (1)' }))
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenCalledWith('household-a', 'import-a', [
      expect.objectContaining({ draftId: 'row-a', includeInHouseholdBudget: false, includeInPersonalBudget: true }),
    ])
  })
  it('supports current-page and all-matching choices across pagination', async () => {
    const batch = detail()
    batch.totalRows = 101
    batch.drafts = Array.from({ length: 101 }, (_, index) => ({ ...batch.drafts[0], id: `row-${index}`, sourceRowNumber: index + 2 }))
    vi.mocked(getImport).mockResolvedValue(batch)
    const { container } = show(<ImportReviewPage />)
    const preset = await screen.findByLabelText('Bulk budget inclusion') as HTMLSelectElement
    await waitFor(() => expect(preset.disabled).toBe(false))
    // A real 100-row page is intentionally retained. Scope accessibility queries
    // to the small toolbars, rather than traversing thousands of row controls.
    const bulkTools = within(preset.closest('section')!)
    const prepareTools = within(container.querySelector<HTMLElement>('.import-control-group')!)
    const pagination = within(container.querySelector<HTMLElement>('.import-pagination')!)
    fireEvent.change(bulkTools.getByLabelText('Apply to'), { target: { value: 'page' } })
    fireEvent.change(preset, { target: { value: 'PersonalAndHousehold' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(bulkTools.getByRole('button', { name: 'Apply budget choices (100)' }))
    await prepareTools.findByRole('button', { name: 'Save all corrections (100)' })
    fireEvent.click(pagination.getByRole('button', { name: 'Next rows' }))
    expect((await screen.findByLabelText('My personal budget') as HTMLInputElement).checked).toBe(false)
    fireEvent.change(bulkTools.getByLabelText('Apply to'), { target: { value: 'matching' } })
    fireEvent.click(bulkTools.getByRole('button', { name: 'Apply budget choices (1)' }))
    await prepareTools.findByRole('button', { name: 'Save all corrections (101)' })
    const saved = { ...batch, drafts: batch.drafts.map(draft => ({ ...draft,
      includeInPersonalBudget: true, includeInHouseholdBudget: true })) }
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 101 })
    fireEvent.click(prepareTools.getByRole('button', { name: 'Save all corrections (101)' }))
    // Await the complete save/refresh cycle; a mock invocation alone does not
    // mean the asynchronous handler has finished before the next test starts.
    await prepareTools.findByText('101 corrections were saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenCalledOnce()
    const updates = vi.mocked(bulkUpdateImportDrafts).mock.calls[0][2]
    expect(updates).toHaveLength(101)
    expect(new Set(updates.map(update => update.draftId)).size).toBe(101)
    expect(updates.every(update => update.includeInPersonalBudget && update.includeInHouseholdBudget)).toBe(true)
  }, 15_000) // Only this real, full-page scenario needs extra headroom on CI.
  it('does not offer bulk controls for completed imports', async () => {
    const completed = detail()
    completed.status = 'Completed'
    vi.mocked(getImports).mockResolvedValue([{ ...listItem, status: 'Completed' }])
    vi.mocked(getImport).mockResolvedValue(completed)
    show(<ImportReviewPage />)
    await screen.findByRole('heading', { name: 'No matching imports' })
    fireEvent.change(screen.getByLabelText('Show imports'), { target: { value: 'completed' } })
    await screen.findByText('Completed imports are retained to preserve the history of official transactions.')
    expect(screen.queryByLabelText('Bulk budget inclusion')).toBeNull()
  })
  it('protects and bulk-saves budget inclusion choices without duplicating rows', async () => {
    show(<ImportReviewPage />)
    await screen.findByLabelText('Description')
    fireEvent.click(screen.getByLabelText('My personal budget'))
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledOnce()
    const saved = detail()
    saved.drafts[0].includeInPersonalBudget = true
    saved.drafts[0].includeInHouseholdBudget = true
    vi.mocked(getImport).mockResolvedValue(saved)
    vi.mocked(bulkUpdateImportDrafts).mockResolvedValue({ savedRows: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Save all corrections (1)' }))
    await screen.findByText('1 correction was saved.')
    expect(bulkUpdateImportDrafts).toHaveBeenCalledWith('household-a', 'import-a', [
      expect.objectContaining({ draftId: 'row-a', includeInHouseholdBudget: true, includeInPersonalBudget: true }),
    ])
  })
  it('canceled route/import/filter changes keep corrections and the selected import', async () => {
    show(<ImportReviewPage />)
    const input = await screen.findByLabelText('Description') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Unsaved correction' } })
    await screen.findByRole('button', { name: 'Save all corrections (1)' })
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
