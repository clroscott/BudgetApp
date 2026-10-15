import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PendingDraftUpdate } from './importBudgetInclusion'

export type PendingBudgetFlags = Pick<PendingDraftUpdate, 'includeInHouseholdBudget' | 'includeInPersonalBudget'>

// Stable for keystrokes, but never revived by A -> B -> A navigation. Async row
// callbacks retain their original context identity, including dirty-cache clears.
export function useImportReviewGuard(contextKey: string) {
  const context = useMemo(() => ({ key: contextKey }), [contextKey])
  const active = useRef<typeof context | null>(null)
  useLayoutEffect(() => {
    active.current = context
    return () => { if (active.current === context) active.current = null }
  }, [context])
  return useCallback(() => active.current === context, [context])
}

interface DraftCache {
  updates: Map<string, PendingDraftUpdate>
  budgetFlags: Map<string, PendingBudgetFlags>
  editedIdsKey: string
}

function emptyCache(): DraftCache {
  return { updates: new Map(), budgetFlags: new Map(), editedIdsKey: '' }
}

function sameUpdate(left: PendingDraftUpdate | undefined, right: PendingDraftUpdate) {
  return left !== undefined && left.transactionDate === right.transactionDate && left.amount === right.amount &&
    left.description === right.description && left.selectedCategoryId === right.selectedCategoryId &&
    left.includeInHouseholdBudget === right.includeInHouseholdBudget && left.includeInPersonalBudget === right.includeInPersonalBudget
}

function applyChanges(current: DraftCache, changes: ReadonlyMap<string, PendingDraftUpdate | null>): DraftCache {
  let updates = current.updates
  let budgetFlags = current.budgetFlags
  let membershipChanged = false
  for (const [id, update] of changes) {
    const previous = updates.get(id)
    if (update ? sameUpdate(previous, update) : !previous) continue
    if (updates === current.updates) updates = new Map(updates)
    if (update) updates.set(id, update)
    else updates.delete(id)
    membershipChanged ||= Boolean(previous) !== Boolean(update)
    const previousFlags = budgetFlags.get(id)
    if (update && previousFlags && previousFlags.includeInHouseholdBudget === update.includeInHouseholdBudget &&
      previousFlags.includeInPersonalBudget === update.includeInPersonalBudget) continue
    if (budgetFlags === current.budgetFlags) budgetFlags = new Map(budgetFlags)
    if (update) budgetFlags.set(id, { includeInHouseholdBudget: update.includeInHouseholdBudget, includeInPersonalBudget: update.includeInPersonalBudget })
    else budgetFlags.delete(id)
  }
  if (updates === current.updates) return current
  return { updates, budgetFlags, editedIdsKey: membershipChanged ? [...updates.keys()].sort().join(',') : current.editedIdsKey }
}

// Transaction corrections survive row-page/filter changes. Only the selected
// household/import owner may clear this cache, following the page's existing guard.
export function useImportDraftCache() {
  const [cache, setCache] = useState(emptyCache)
  const updateDraft = useCallback((id: string, update: PendingDraftUpdate | null) => {
    setCache(current => applyChanges(current, new Map([[id, update]])))
  }, [])
  const updateDrafts = useCallback((changes: ReadonlyMap<string, PendingDraftUpdate | null>) => {
    setCache(current => applyChanges(current, changes))
  }, [])
  const clearDrafts = useCallback(() => {
    setCache(current => current.updates.size === 0 ? current : emptyCache())
  }, [])
  return { dirtyDraftUpdates: cache.updates, budgetFlags: cache.budgetFlags,
    editedDraftIdsKey: cache.editedIdsKey, updateDraft, updateDrafts, clearDrafts }
}
