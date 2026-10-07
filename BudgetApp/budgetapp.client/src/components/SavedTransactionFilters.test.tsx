import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLink } from '../routing/AppLink'
import { RouterProvider } from '../routing/RouterProvider'
import { checkSavedFilter, deleteFilter, getSavedFilters, renameFilter, saveFilter, type SavedTransactionFilter } from '../transactions/savedFilterApi'
import { createDefaultFilters, storedFilterIntent } from '../transactions/transactionFilters'
import { SavedTransactionFilters } from './SavedTransactionFilters'

vi.mock('../transactions/savedFilterApi', () => ({
  getSavedFilters: vi.fn(), checkSavedFilter: vi.fn(), saveFilter: vi.fn(), renameFilter: vi.fn(), deleteFilter: vi.fn(),
}))
const filters = createDefaultFilters()
const preset: SavedTransactionFilter = { id: 'preset-a', name: 'Rent', filters: storedFilterIntent(filters), version: 'version-a', unavailableReferences: [] }
function show(pendingFilterChanges = false, onApply = vi.fn(() => true)) {
  const view = render(<RouterProvider><SavedTransactionFilters householdId="household-a" appliedFilters={filters}
    pendingFilterChanges={pendingFilterChanges} disabled={false} onApply={onApply} />
    <AppLink to="/dashboard">Leave page</AppLink></RouterProvider>)
  return { ...view, onApply }
}
async function loaded() {
  await waitFor(() => expect(screen.queryByText('Loading saved filters...')).toBeNull())
}
function manage() { fireEvent.click(screen.getByText('Save or manage presets')) }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSavedFilters).mockReset().mockResolvedValue([preset])
  vi.mocked(checkSavedFilter).mockReset().mockResolvedValue(preset)
  vi.mocked(saveFilter).mockReset().mockResolvedValue(preset)
  vi.mocked(renameFilter).mockReset().mockResolvedValue({ ...preset, name: 'Housing', version: 'version-b' })
  vi.mocked(deleteFilter).mockReset().mockResolvedValue()
})
describe('private saved transaction filters', () => {
  it('distinguishes loading, a successful empty list, and a failed load with retry', async () => {
    vi.mocked(getSavedFilters).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce([])
    show()
    expect(screen.getByText('Loading saved filters...')).toBeTruthy()
    await screen.findByRole('button', { name: 'Retry saved filters' })
    expect(screen.queryByText('No saved filters yet.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved filters' }))
    await screen.findByText('No saved filters yet.')
    expect(getSavedFilters).toHaveBeenCalledTimes(2)
  })
  it('saves applied intent, preserves the name on failure, and reuses the creation ID on retry', async () => {
    vi.mocked(saveFilter).mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce(preset)
    show()
    await loaded()
    manage()
    fireEvent.change(screen.getByLabelText('New preset name'), { target: { value: 'Rent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save applied filters' }))
    await screen.findByText('Response lost')
    expect((screen.getByLabelText('New preset name') as HTMLInputElement).value).toBe('Rent')
    const id = vi.mocked(saveFilter).mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: 'Save applied filters' }))
    await screen.findByText('Filter saved. No transactions were changed.')
    expect(saveFilter).toHaveBeenLastCalledWith('household-a', id, 'Rent', storedFilterIntent(filters))
    expect((screen.getByLabelText('New preset name') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('link', { name: 'Leave page' }))
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('requires applying pending filter edits before saving', async () => {
    show(true)
    await loaded()
    manage()
    fireEvent.change(screen.getByLabelText('New preset name'), { target: { value: 'Changed filters' } })
    expect((screen.getByRole('button', { name: 'Save applied filters' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Apply your filter changes before saving a preset.')).toBeTruthy()
    expect(saveFilter).not.toHaveBeenCalled()
  })
  it('rechecks references at apply time and stages unavailable choices without searching', async () => {
    const missing = { ...preset, filters: { ...preset.filters, accountId: 'missing' }, unavailableReferences: ['The selected account is unavailable.'] }
    vi.mocked(checkSavedFilter).mockResolvedValue(missing)
    const { onApply } = show()
    await loaded()
    fireEvent.change(screen.getByLabelText('Saved filter'), { target: { value: preset.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply saved filter' }))
    await screen.findByText(/Preset not applied/)
    expect(checkSavedFilter).toHaveBeenCalledWith('household-a', preset.id)
    expect(onApply).toHaveBeenCalledWith(missing.filters, false)
    expect(screen.getByText('The selected account is unavailable.')).toBeTruthy()
  })
  it('does not announce an application when the unsaved-change guard cancels it', async () => {
    const { onApply } = show(false, vi.fn(() => false))
    await loaded()
    fireEvent.change(screen.getByLabelText('Saved filter'), { target: { value: preset.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply saved filter' }))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(screen.queryByText(/Applied Rent/)).toBeNull()
  })
  it('returns lost keyboard focus to Apply after checking the preset', async () => {
    const { onApply } = show()
    await loaded()
    fireEvent.change(screen.getByLabelText('Saved filter'), { target: { value: preset.id } })
    const button = screen.getByRole('button', { name: 'Apply saved filter' })
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    await waitFor(() => expect(document.activeElement).toBe(button))
  })
  it('renames and deletes only the selected preset, retaining current results and confirming removal', async () => {
    show()
    await loaded()
    fireEvent.change(screen.getByLabelText('Saved filter'), { target: { value: preset.id } })
    manage()
    fireEvent.change(screen.getByLabelText('Rename selected preset'), { target: { value: 'Housing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename preset' }))
    await screen.findByText('Filter renamed.')
    expect(renameFilter).toHaveBeenCalledWith('household-a', preset, 'Housing')
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset' }))
    expect(deleteFilter).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset' }))
    await screen.findByText('Saved filter deleted. The current results are unchanged.')
    expect(deleteFilter).toHaveBeenCalledWith('household-a', expect.objectContaining({ id: preset.id, version: 'version-b' }))
  })
  it('protects unfinished preset naming against leaving the page', async () => {
    show()
    await loaded()
    manage()
    fireEvent.change(screen.getByLabelText('New preset name'), { target: { value: 'Unfinished' } })
    fireEvent.click(screen.getByRole('link', { name: 'Leave page' }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).not.toBe('/dashboard')
  })
  it('retains loaded presets after refresh failure instead of claiming an empty list', async () => {
    show()
    await loaded()
    manage()
    vi.mocked(getSavedFilters).mockRejectedValueOnce(new Error('Refresh failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved filters' }))
    await screen.findByText(/Previously loaded presets may be out of date/)
    expect(screen.queryByText('No saved filters yet.')).toBeNull()
  })
  it('refreshes a clean renamed selection without creating a false unsaved-name warning', async () => {
    show()
    await loaded()
    fireEvent.change(screen.getByLabelText('Saved filter'), { target: { value: preset.id } })
    manage()
    vi.mocked(getSavedFilters).mockResolvedValueOnce([{ ...preset, name: 'Changed elsewhere', version: 'v2' }])
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved filters' }))
    await screen.findByRole('option', { name: 'Changed elsewhere' })
    expect((screen.getByLabelText('Rename selected preset') as HTMLInputElement).value).toBe('Changed elsewhere')
    fireEvent.click(screen.getByRole('link', { name: 'Leave page' }))
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('keeps the entered name if the selected preset was removed elsewhere', async () => {
    show()
    await loaded()
    fireEvent.change(screen.getByLabelText('Saved filter'), { target: { value: preset.id } })
    manage()
    fireEvent.change(screen.getByLabelText('Rename selected preset'), { target: { value: 'Keep this name' } })
    vi.mocked(getSavedFilters).mockResolvedValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved filters' }))
    await screen.findByText(/Its edited name was kept as a new preset name/)
    expect((screen.getByLabelText('New preset name') as HTMLInputElement).value).toBe('Keep this name')
    fireEvent.click(screen.getByRole('link', { name: 'Leave page' }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
})
