import { describe, expect, it } from 'vitest'
import type { ImportDraftItem } from './importApi'
import { countBulkBudgetInclusion, draftUpdate, previewBulkBudgetInclusion, type BudgetInclusionPreset } from './importBudgetInclusion'

const row: ImportDraftItem = {
  id: 'row-a', sourceRowNumber: 2, transactionDate: '2026-07-01', amount: 100, description: 'Original',
  importedCategoryName: null, importedSubcategoryName: null, selectedCategoryId: 'housing',
  validationStatus: 'Valid', validationMessage: null, duplicateStatus: 'NoMatch',
  possibleMatchingTransactionId: null, reviewDecision: 'Pending', isDuplicateAcknowledged: false,
  approvedTransactionId: null, includeInHouseholdBudget: true, includeInPersonalBudget: false,
  canChangeHouseholdInclusion: true, canChangePersonalInclusion: true,
}
describe('bulk staged budget inclusion', () => {
  it.each<BudgetInclusionPreset | ''>(['', 'Personal', 'Household', 'PersonalAndHousehold', 'Neither'])(
    'count-only preview matches staged-update decisions for %s', preset => {
      const drafts = [row, { ...row, id: 'excluded', reviewDecision: 'Excluded' },
        { ...row, id: 'linked', approvedTransactionId: 'transaction' },
        { ...row, id: 'protected-personal', canChangePersonalInclusion: false },
        { ...row, id: 'protected-household', canChangeHouseholdInclusion: false },
        { ...row, id: 'defaults', includeInHouseholdBudget: undefined, includeInPersonalBudget: undefined },
        { ...row, id: 'other', includeInHouseholdBudget: false, includeInPersonalBudget: true }]
      const pending = new Map([[row.id, { ...draftUpdate(row), description: '', selectedCategoryId: null,
        includeInHouseholdBudget: false, includeInPersonalBudget: true }]])
      const updates = previewBulkBudgetInclusion(drafts, pending, preset)
      expect(countBulkBudgetInclusion(drafts, pending, preset)).toEqual({ changed: updates.changes.size,
        skipped: updates.skipped, unchanged: updates.unchanged })
    })
  it.each<[BudgetInclusionPreset, boolean, boolean]>([
    ['Personal', false, true], ['Household', true, false], ['PersonalAndHousehold', true, true], ['Neither', false, false],
  ])('sets %s without changing financial corrections', (preset, household, personal) => {
    const pending = new Map([[row.id, { ...draftUpdate(row), description: 'Unsaved correction',
      includeInHouseholdBudget: !household, includeInPersonalBudget: !personal }]])
    const result = previewBulkBudgetInclusion([row], pending, preset)
    expect(result.changes.get(row.id)).toEqual({ ...draftUpdate(row), description: 'Unsaved correction',
      includeInHouseholdBudget: household, includeInPersonalBudget: personal })
    expect(pending.get(row.id)?.description).toBe('Unsaved correction')
  })
  it('skips excluded, linked and another reviewer’s protected rows', () => {
    const result = previewBulkBudgetInclusion([
      { ...row, id: 'excluded', reviewDecision: 'Excluded' },
      { ...row, id: 'linked', approvedTransactionId: 'transaction-a' },
      { ...row, id: 'protected', canChangePersonalInclusion: false },
      row,
    ], new Map(), 'PersonalAndHousehold')
    expect(result.skipped).toBe(3)
    expect([...result.changes.keys()]).toEqual(['row-a'])
  })
  it('respects a Viewer’s Household restriction while allowing their own Personal choice', () => {
    const privateRow = { ...row, includeInHouseholdBudget: false, canChangeHouseholdInclusion: false }
    expect(previewBulkBudgetInclusion([privateRow], new Map(), 'PersonalAndHousehold').skipped).toBe(1)
    expect(previewBulkBudgetInclusion([privateRow], new Map(), 'Personal').changes.size).toBe(1)
  })
  it('counts unchanged rows and removes an inclusion-only edit when reverted', () => {
    expect(previewBulkBudgetInclusion([row], new Map(), 'Household').unchanged).toBe(1)
    const pending = new Map([[row.id, { ...draftUpdate(row), includeInPersonalBudget: true }]])
    expect(previewBulkBudgetInclusion([row], pending, 'Household').changes.get(row.id)).toBeNull()
  })
})
