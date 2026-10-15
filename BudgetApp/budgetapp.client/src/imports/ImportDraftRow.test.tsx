import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DraftRow } from './ImportDraftRow'
import type { ImportDraftItem } from './importApi'
import { RouterProvider } from '../routing/RouterProvider'

const draft: ImportDraftItem = { id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-01-01', amount: 10,
  description: 'Original', importedCategoryName: null, importedSubcategoryName: null, selectedCategoryId: null,
  validationStatus: 'Valid', validationMessage: null, duplicateStatus: 'NotDuplicate', possibleMatchingTransactionId: null,
  reviewDecision: 'Pending', isDuplicateAcknowledged: false, approvedTransactionId: null }

describe('memoized import row boundaries', () => {
  it('skips unchanged rows, keeps focus/local text, and still responds to permission changes', () => {
    const readDescription = vi.fn(() => 'Other row')
    const other = { ...draft, id: 'row-b', sourceRowNumber: 3 }
    Object.defineProperty(other, 'description', { get: readDescription, enumerable: true })
    const callbacks = { onChanged: vi.fn(async () => true), onMutation: vi.fn(async () => true),
      getVersion: () => 'version', onRuleCreated: vi.fn(async () => 0), onFillRemaining: vi.fn(async () => true),
      onDirtyChange: vi.fn(), onRuleDirtyChange: vi.fn(), onRemove: vi.fn(async () => {}),
      onError: vi.fn(), onBusyChange: vi.fn() }
    const categories: [] = []
    const rows = (canEdit = true) => <RouterProvider>
      <DraftRow householdId="household" importFileId="import" draft={draft} categories={categories}
        pendingUpdate={null} canEdit isCompleted={false} {...callbacks} />
      <DraftRow householdId="household" importFileId="import" draft={other} categories={categories}
        pendingUpdate={null} canEdit={canEdit} isCompleted={false} {...callbacks} />
    </RouterProvider>
    const view = render(rows())
    const input = within(screen.getByRole('article', { name: 'CSV row 2' })).getByLabelText('Description') as HTMLInputElement
    const otherReads = readDescription.mock.calls.length
    input.focus()
    fireEvent.change(input, { target: { value: 'Keep this edit' } })
    view.rerender(rows())
    expect(readDescription).toHaveBeenCalledTimes(otherReads)
    expect(input.value).toBe('Keep this edit')
    expect(document.activeElement).toBe(input)
    view.rerender(rows(false))
    expect(readDescription.mock.calls.length).toBeGreaterThan(otherReads)
    expect((within(screen.getByRole('article', { name: 'CSV row 3' })).getByLabelText('Description') as HTMLInputElement).disabled).toBe(true)
    expect(input.value).toBe('Keep this edit')
  })
})
