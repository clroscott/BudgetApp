import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useImportDraftCache, useImportReviewGuard } from './useImportDraftCache'
import type { PendingDraftUpdate } from './importBudgetInclusion'

const correction: PendingDraftUpdate = { transactionDate: '', amount: '', description: '', selectedCategoryId: null,
  includeInHouseholdBudget: false, includeInPersonalBudget: true }

describe('import draft cache coordination', () => {
  it('keeps guards stable for edits but never revives old actions after A -> B -> A or unmount', () => {
    const { result, rerender, unmount } = renderHook(({ key }) => useImportReviewGuard(key), { initialProps: { key: 'household/import-a' } })
    const first = result.current
    expect(first()).toBe(true)
    rerender({ key: 'household/import-a' })
    expect(result.current).toBe(first)
    rerender({ key: 'household/import-b' })
    expect(first()).toBe(false)
    rerender({ key: 'household/import-a' })
    expect(first()).toBe(false)
    const current = result.current
    expect(current()).toBe(true)
    unmount()
    expect(current()).toBe(false)
  })
  it('bails out for absent removals, repeated updates, and clearing an empty cache', () => {
    const { result } = renderHook(useImportDraftCache)
    const empty = result.current
    act(() => result.current.updateDraft('missing', null))
    expect(result.current).toBe(empty)
    act(() => result.current.clearDrafts())
    expect(result.current).toBe(empty)
    act(() => result.current.updateDraft('row', correction))
    const saved = result.current
    act(() => result.current.updateDraft('row', { ...correction }))
    expect(result.current).toBe(saved)
  })

  it('changes text without invalidating budget flags or edited-ID membership', () => {
    const { result } = renderHook(useImportDraftCache)
    act(() => result.current.updateDraft('row', correction))
    const before = result.current
    act(() => result.current.updateDraft('row', { ...correction, description: 'new text', selectedCategoryId: 'category' }))
    expect(result.current.dirtyDraftUpdates.get('row')?.description).toBe('new text')
    expect(result.current.budgetFlags).toBe(before.budgetFlags)
    expect(result.current.editedDraftIdsKey).toBe(before.editedDraftIdsKey)
    expect(before.dirtyDraftUpdates.get('row')).toBe(correction)
    act(() => result.current.updateDraft('row', { ...correction, includeInHouseholdBudget: true }))
    expect(result.current.budgetFlags).not.toBe(before.budgetFlags)
    expect(result.current.editedDraftIdsKey).toBe('row')
  })

  it('preserves explicit blanks, null category, and off-page corrections while batching membership changes', () => {
    const { result } = renderHook(useImportDraftCache)
    act(() => result.current.updateDrafts(new Map([['z', correction], ['a', { ...correction, amount: '-0.0001' }]])))
    expect(result.current.editedDraftIdsKey).toBe('a,z')
    expect(result.current.dirtyDraftUpdates.get('z')).toEqual(correction)
    act(() => result.current.updateDraft('a', null))
    expect(result.current.editedDraftIdsKey).toBe('z')
    expect(result.current.budgetFlags.has('a')).toBe(false)
    expect(result.current.dirtyDraftUpdates.get('z')).toEqual(correction)
    act(() => result.current.clearDrafts())
    expect(result.current.editedDraftIdsKey).toBe('')
    expect(result.current.budgetFlags.size).toBe(0)
  })

  it('keeps the budget index stable when editing one of 10000 staged rows', () => {
    const { result } = renderHook(useImportDraftCache)
    act(() => result.current.updateDrafts(new Map(Array.from({ length: 10000 }, (_, id) => [String(id), correction]))))
    const flags = result.current.budgetFlags
    const ids = result.current.editedDraftIdsKey
    act(() => result.current.updateDraft('50', { ...correction, description: 'one correction' }))
    expect(result.current.dirtyDraftUpdates.size).toBe(10000)
    expect(result.current.budgetFlags).toBe(flags)
    expect(result.current.editedDraftIdsKey).toBe(ids)
  })
})
