import type { ImportDraftItem, ImportBudgetChoiceCandidate } from './importApi'

export type BudgetChoiceDraft = ImportBudgetChoiceCandidate & Partial<Pick<ImportDraftItem,
  'approvedTransactionId' | 'reviewDecision' | 'canChangePersonalInclusion' | 'canChangeHouseholdInclusion'>>

export interface PendingDraftUpdate {
  transactionDate: string
  amount: string
  description: string
  selectedCategoryId: string | null
  includeInHouseholdBudget: boolean
  includeInPersonalBudget: boolean
}

export type BudgetInclusionPreset = 'Personal' | 'Household' | 'PersonalAndHousehold' | 'Neither'

// Counts depend on budget flags, not text/date/category corrections. Full update
// objects are constructed only when the user explicitly applies a preset.
export function countBulkBudgetInclusion(
  drafts: BudgetChoiceDraft[], pending: ReadonlyMap<string, Pick<PendingDraftUpdate,
    'includeInHouseholdBudget' | 'includeInPersonalBudget'>>, preset: BudgetInclusionPreset | '',
) {
  let changed = 0, skipped = 0, unchanged = 0
  if (!preset) return { changed, skipped, unchanged }
  const household = preset === 'Household' || preset === 'PersonalAndHousehold'
  const personal = preset === 'Personal' || preset === 'PersonalAndHousehold'
  for (const draft of drafts) {
    const savedHousehold = draft.includeInHouseholdBudget ?? true
    if (draft.approvedTransactionId || draft.reviewDecision === 'Excluded' || draft.canChangePersonalInclusion === false ||
      draft.canChangeHouseholdInclusion === false && savedHousehold !== household) { skipped++; continue }
    const flags = pending.get(draft.id)
    if ((flags?.includeInHouseholdBudget ?? savedHousehold) === household &&
      (flags?.includeInPersonalBudget ?? draft.includeInPersonalBudget ?? false) === personal) unchanged++
    else changed++
  }
  return { changed, skipped, unchanged }
}

export function draftUpdate(draft: BudgetChoiceDraft): PendingDraftUpdate {
  return {
    transactionDate: draft.transactionDate ?? '', amount: draft.amount?.toString() ?? '',
    description: draft.description ?? '', selectedCategoryId: draft.selectedCategoryId,
    includeInHouseholdBudget: draft.includeInHouseholdBudget ?? true,
    includeInPersonalBudget: draft.includeInPersonalBudget ?? false,
  }
}

export function previewBulkBudgetInclusion(
  drafts: BudgetChoiceDraft[], pending: ReadonlyMap<string, PendingDraftUpdate>, preset: BudgetInclusionPreset | '',
) {
  const changes = new Map<string, PendingDraftUpdate | null>()
  let skipped = 0
  let unchanged = 0
  if (!preset) return { changes, skipped, unchanged }
  const household = preset === 'Household' || preset === 'PersonalAndHousehold'
  const personal = preset === 'Personal' || preset === 'PersonalAndHousehold'
  for (const draft of drafts) {
    const saved = draftUpdate(draft)
    if (draft.approvedTransactionId || draft.reviewDecision === 'Excluded' ||
      draft.canChangePersonalInclusion === false ||
      draft.canChangeHouseholdInclusion === false && saved.includeInHouseholdBudget !== household) {
      skipped++
      continue
    }
    const current = pending.get(draft.id) ?? saved
    if (current.includeInHouseholdBudget === household && current.includeInPersonalBudget === personal) {
      unchanged++
      continue
    }
    const updated = { ...current, includeInHouseholdBudget: household, includeInPersonalBudget: personal }
    // Reverting only the budget flags must also clear the row's unsaved warning.
    changes.set(draft.id, JSON.stringify(updated) === JSON.stringify(saved) ? null : updated)
  }
  return { changes, skipped, unchanged }
}
