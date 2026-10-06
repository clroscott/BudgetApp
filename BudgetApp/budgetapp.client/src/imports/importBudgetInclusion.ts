import type { ImportDraftItem } from './importApi'

export interface PendingDraftUpdate {
  transactionDate: string
  amount: string
  description: string
  selectedCategoryId: string | null
  includeInHouseholdBudget: boolean
  includeInPersonalBudget: boolean
}

export type BudgetInclusionPreset = 'Personal' | 'Household' | 'PersonalAndHousehold' | 'Neither'

export function draftUpdate(draft: ImportDraftItem): PendingDraftUpdate {
  return {
    transactionDate: draft.transactionDate ?? '', amount: draft.amount?.toString() ?? '',
    description: draft.description ?? '', selectedCategoryId: draft.selectedCategoryId,
    includeInHouseholdBudget: draft.includeInHouseholdBudget ?? true,
    includeInPersonalBudget: draft.includeInPersonalBudget ?? false,
  }
}

export function previewBulkBudgetInclusion(
  drafts: ImportDraftItem[], pending: ReadonlyMap<string, PendingDraftUpdate>, preset: BudgetInclusionPreset | '',
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
