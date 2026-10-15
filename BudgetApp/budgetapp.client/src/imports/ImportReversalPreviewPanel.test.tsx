import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/apiClient'
import { getImportReversalPreview, reverseImport, type ImportReversalPreview } from './importApi'
import { ImportReversalPreviewPanel } from './ImportReversalPreviewPanel'

vi.mock('./importApi', () => ({ getImportReversalPreview: vi.fn(), reverseImport: vi.fn() }))

function fixture(overrides: Partial<ImportReversalPreview> = {}): ImportReversalPreview {
  return { previewVersion: 'A'.repeat(64), status: 'Completed', importFileId: 'file-a', originalFileName: 'sample.xlsx', accountName: 'My account', currency: 'CAD',
    sourceWorksheetName: 'Transactions', importUpdatedAtUtc: '2026-10-15T12:00:00Z', checkedAtUtc: '2026-10-15T13:00:00Z',
    canReverse: true, linkedTransactionCount: 1, eligibleRowCount: 1, blockedRowCount: 0, blockingReasons: [],
    items: [{ draftId: 'draft-a', sourceRowNumber: 2, transactionId: 'tx-a', transactionDate: '2026-10-01',
      amount: -2.3456, description: 'Sample merchant', draftUpdatedAtUtc: '2026-10-15T12:00:00Z',
      transactionUpdatedAtUtc: '2026-10-15T12:00:00Z', isEligible: true, blockingReasons: [] }],
    page: 1, pageSize: 100, totalCount: 1, totalPages: 1, ...overrides }
}

const onReversed = vi.fn()
const onBusyChange = vi.fn()
beforeEach(() => {
  vi.mocked(getImportReversalPreview).mockResolvedValue(fixture())
  vi.mocked(reverseImport).mockResolvedValue({ importFileId: 'file-a', status: 'Reversed', reversedTransactionCount: 1,
    updatedAtUtc: '2026-10-16T12:00:00Z', alreadyReversed: false })
})
const show = () => render(<ImportReversalPreviewPanel householdId="home-a" importId="file-a" onReversed={onReversed} onBusyChange={onBusyChange} />)
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Preview undo' }))

describe('confirmed whole-batch import undo', () => {
  it('only reads after explicit opening, identifies its file/sheet and preserves four decimals', async () => {
    show()
    expect(getImportReversalPreview).not.toHaveBeenCalled()
    open()
    await screen.findByText(/All rows pass the current checks/)
    expect(getImportReversalPreview).toHaveBeenCalledWith('home-a', 'file-a', 1, expect.any(AbortSignal))
    expect(screen.getByText(/Checking this preview changes nothing/)).toBeTruthy()
    expect(screen.getByText('Sample merchant')).toBeTruthy()
    expect(screen.getByText(/2\.3456/)).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Amount (CAD)' })).toBeTruthy()
    expect(screen.getByText(/Worksheet: Transactions/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Undo import$/ })).toBeTruthy()
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('requires confirmation and suppresses duplicate clicks while the command is pending', async () => {
    show(); open(); await screen.findByText('Sample merchant')
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }))
    expect(reverseImport).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    let resolve!: (value: Awaited<ReturnType<typeof reverseImport>>) => void
    vi.mocked(reverseImport).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undoing import…' }))
    expect(reverseImport).toHaveBeenCalledExactlyOnceWith('home-a', 'file-a', 'A'.repeat(64))
    expect((screen.getByRole('button', { name: 'Close undo preview' }) as HTMLButtonElement).disabled).toBe(true)
    expect(onBusyChange).toHaveBeenCalledWith(true)
    await act(async () => resolve({ importFileId: 'file-a', status: 'Reversed', reversedTransactionCount: 1,
      updatedAtUtc: '2026-10-16T12:00:00Z', alreadyReversed: false }))
    expect(onReversed).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Undo import' })).toBeNull()
  })
  it('does not replay an uncertain write; a fresh read reconciles an already-saved undo', async () => {
    vi.mocked(window.confirm).mockReturnValue(true)
    vi.mocked(reverseImport).mockRejectedValueOnce(new ApiError('Response lost', 0))
    show(); open(); await screen.findByText('Sample merchant')
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }))
    await screen.findByText('Refresh the undo preview to check the saved status before trying again.')
    expect((screen.getByRole('button', { name: 'Undo import' }) as HTMLButtonElement).disabled).toBe(true)
    vi.mocked(getImportReversalPreview).mockResolvedValueOnce(fixture({ status: 'Reversed', canReverse: false, items: [] }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('This import has already been undone. Its history is retained.')
    expect(reverseImport).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Undo import' })).toBeNull()
  })
  it('shows row blockers and the whole-batch restriction', async () => {
    const item = fixture().items[0]
    vi.mocked(getImportReversalPreview).mockResolvedValue(fixture({ canReverse: false, eligibleRowCount: 0,
      blockedRowCount: 1, blockingReasons: ['Partial undo is not supported.'],
      items: [{ ...item, isEligible: false, blockingReasons: ['This transaction was edited.'] }] }))
    show(); open()
    await screen.findByText('This transaction was edited.')
    expect(screen.getByText('Partial undo is not supported.')).toBeTruthy()
    expect(screen.getByText('This import cannot currently be undone as a whole.')).toBeTruthy()
  })
  it('offers a safe retry after failed reads', async () => {
    vi.mocked(getImportReversalPreview).mockRejectedValueOnce(new Error('Preview unavailable'))
    show(); open()
    await screen.findByText('Could not load undo preview')
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await screen.findByText('Sample merchant')
    expect(getImportReversalPreview).toHaveBeenCalledTimes(2)
  })
  it('hides retained private data if access is revoked on refresh', async () => {
    show(); open(); await screen.findByText('Sample merchant')
    vi.mocked(getImportReversalPreview).mockRejectedValueOnce(new ApiError('Access denied', 403))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await screen.findByText('Could not load undo preview')
    expect(screen.queryByText('Sample merchant')).toBeNull()
    expect(screen.queryByText(/All rows pass/)).toBeNull()
  })
  it('ignores late responses from a closed or replaced preview', async () => {
    let resolve!: (value: ImportReversalPreview) => void
    vi.mocked(getImportReversalPreview).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    show(); open()
    await waitFor(() => expect(getImportReversalPreview).toHaveBeenCalledOnce())
    const signal = vi.mocked(getImportReversalPreview).mock.calls[0][3]!
    fireEvent.click(screen.getByRole('button', { name: 'Close undo preview' }))
    expect(signal.aborted).toBe(true)
    open(); await screen.findByText('Sample merchant')
    await act(async () => resolve(fixture({ accountName: 'Old private account', items: [] })))
    expect(screen.queryByText(/Old private account/)).toBeNull()
    expect(screen.getByText('Sample merchant')).toBeTruthy()
  })
  it('pages via bounded reads without triggering a navigation/discard prompt', async () => {
    vi.mocked(getImportReversalPreview).mockResolvedValueOnce(fixture({ totalCount: 101, totalPages: 2 }))
    show(); open(); await screen.findByText('Page 1 of 2')
    vi.mocked(getImportReversalPreview).mockResolvedValueOnce(fixture({ page: 2, totalCount: 101, totalPages: 2 }))
    fireEvent.click(screen.getByRole('button', { name: 'Next preview rows' }))
    await screen.findByText('Page 2 of 2')
    expect(getImportReversalPreview).toHaveBeenLastCalledWith('home-a', 'file-a', 2, expect.any(AbortSignal))
    expect(window.confirm).not.toHaveBeenCalled()
  })
})
