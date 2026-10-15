import { apiDelete, apiGet, apiPost, apiPostForm, apiPut } from '../api/apiClient'

export interface CsvImportResult {
  importFileId: string
  originalFileName: string
  accountName: string
  status: 'ReadyForReview'
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  sourceWorksheetName?: string | null
}

export interface ImportListItem {
  id: string
  originalFileName: string
  accountName: string
  status: string
  totalRows: number
  validRows: number
  invalidRows: number
  approvedRows: number
  excludedRows: number
  duplicateRows: number
  uploadedAtUtc: string
  canEdit: boolean
  sourceWorksheetName?: string | null
}

export type ImportListFilter = 'inProgress' | 'completed' | 'all' | 'ready'
export interface ImportListResult {
  items: ImportListItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  totalVisibleCount: number
}
export interface ImportSummary {
  totalCount: number
  unfinishedCount: number
  readyForReviewCount: number
}

export interface ImportDraftItem {
  id: string
  sourceRowNumber: number
  transactionDate: string | null
  amount: number | null
  description: string | null
  importedCategoryName: string | null
  importedSubcategoryName: string | null
  selectedCategoryId: string | null
  validationStatus: string
  validationMessage: string | null
  duplicateStatus: string
  possibleMatchingTransactionId: string | null
  reviewDecision: string
  isDuplicateAcknowledged: boolean
  includeInHouseholdBudget?: boolean
  includeInPersonalBudget?: boolean
  canChangePersonalInclusion?: boolean
  canChangeHouseholdInclusion?: boolean
  approvedTransactionId: string | null
}

export interface ImportReviewDetail extends Omit<ImportListItem, 'uploadedAtUtc'> {
  currency: string
  drafts: ImportDraftItem[]
  sourceWorksheetName?: string | null
}

export interface CompleteImportResult {
  importFileId: string
  createdTransactionCount: number
  approvedRows: number
  excludedRows: number
  status: string
}

export interface ImportReversalPreviewRow {
  draftId: string | null
  sourceRowNumber: number | null
  transactionId: string | null
  transactionDate: string | null
  amount: number | null
  description: string | null
  draftUpdatedAtUtc: string | null
  transactionUpdatedAtUtc: string | null
  isEligible: boolean
  blockingReasons: string[]
}

export interface ImportReversalPreview {
  previewVersion: string
  status: string
  importFileId: string
  originalFileName: string
  accountName: string
  currency: string
  sourceWorksheetName: string | null
  importUpdatedAtUtc: string
  checkedAtUtc: string
  canReverse: boolean
  linkedTransactionCount: number
  eligibleRowCount: number
  blockedRowCount: number
  blockingReasons: string[]
  items: ImportReversalPreviewRow[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface ReverseImportResult {
  importFileId: string
  status: string
  reversedTransactionCount: number
  updatedAtUtc: string
  alreadyReversed: boolean
}

export function reverseImport(householdId: string, importFileId: string, previewVersion: string): Promise<ReverseImportResult> {
  return apiPost(`${importPath(householdId, importFileId)}/reverse`, { previewVersion, confirmed: true })
}

export function getImportReversalPreview(householdId: string, importFileId: string, page = 1, signal?: AbortSignal): Promise<ImportReversalPreview> {
  return apiGet(`${importPath(householdId, importFileId)}/reversal-preview?page=${page}`, signal)
}

export interface ImportDraftUpdate {
  draftId: string
  transactionDate: string | null
  amount: number | null
  description: string | null
  selectedCategoryId: string | null
  includeInHouseholdBudget?: boolean
  includeInPersonalBudget?: boolean
}

export type ImportDraftFilter = 'all' | 'pending' | 'uncategorized' | 'parentOnly' |
  'categorized' | 'possibleDuplicates' | 'invalid' | 'approved' | 'excluded'
const draftFilters: Record<ImportDraftFilter, string> = {
  all: 'All', pending: 'Pending', uncategorized: 'Uncategorized', parentOnly: 'ParentOnly',
  categorized: 'Categorized', possibleDuplicates: 'PossibleDuplicates', invalid: 'Invalid',
  approved: 'Approved', excluded: 'Excluded',
}
export interface ImportDraftCounts {
  totalRows: number; validRows: number; invalidRows: number; approvedRows: number
  excludedRows: number; duplicateRows: number; pendingRows: number
  uncheckedDuplicateRows: number; validPendingRows: number
}
export interface ImportReviewSummary {
  id: string; originalFileName: string; accountName: string; currency: string; status: string
  canEdit: boolean; counts: ImportDraftCounts; sourceWorksheetName?: string | null; updatedAtUtc: string
}
export interface ImportDraftPageResult {
  summary: ImportReviewSummary; items: ImportDraftItem[]; filter: string
  page: number; pageSize: number; totalCount: number; totalPages: number
}
export interface ImportDraftMutationResult {
  summary: ImportReviewSummary; items: ImportDraftItem[]; removedDraftIds: string[]; savedRows: number
}
export type ImportBudgetChoiceCandidate = Pick<ImportDraftItem, 'id' | 'transactionDate' | 'amount' |
  'description' | 'selectedCategoryId' | 'includeInHouseholdBudget' | 'includeInPersonalBudget'>
export interface ImportBudgetChoicePreview {
  items: ImportBudgetChoiceCandidate[]; skipped: number; unchanged: number; updatedAtUtc: string
}

function importPath(householdId: string, importFileId: string) {
  if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i.test(importFileId)) {
    throw new Error('This import link is invalid. Choose an import from the list.')
  }
  return `/api/households/${householdId}/imports/${encodeURIComponent(importFileId)}`
}

export async function getImportDraftPage(householdId: string, importFileId: string,
  filter: ImportDraftFilter, page: number, signal?: AbortSignal): Promise<ImportDraftPageResult> {
  const query = new URLSearchParams({ filter: draftFilters[filter], page: String(page) })
  return apiGet(`${importPath(householdId, importFileId)}/drafts?${query}`, signal)
}

export function getBudgetChoicePreview(householdId: string, importFileId: string,
  filter: ImportDraftFilter, personal: boolean, household: boolean, editedDraftIds: string[],
  expectedImportUpdatedAtUtc: string): Promise<ImportBudgetChoicePreview> {
  // POST is a read-only preview; no draft or official transaction is written.
  return apiPost(`${importPath(householdId, importFileId)}/budget-choice-preview`,
    { filter: draftFilters[filter], personal, household, editedDraftIds, expectedImportUpdatedAtUtc })
}

function changeQuery(version: string) {
  return new URLSearchParams({ returnChanges: 'true', expectedImportUpdatedAtUtc: version })
}
export function saveImportDraft(householdId: string, importFileId: string, draftId: string,
  request: Omit<ImportDraftUpdate, 'draftId'>, version: string): Promise<ImportDraftMutationResult> {
  return apiPut(`${importPath(householdId, importFileId)}/drafts/${draftId}?${changeQuery(version)}`, request)
}
export function saveImportDrafts(householdId: string, importFileId: string,
  drafts: ImportDraftUpdate[], version: string): Promise<ImportDraftMutationResult> {
  return apiPut(`${importPath(householdId, importFileId)}/drafts?${changeQuery(version)}`, { drafts })
}
export function decideImportDraft(householdId: string, importFileId: string, draftId: string,
  decision: 'Approved' | 'Excluded' | 'Pending', acknowledgePossibleDuplicate: boolean,
  version: string): Promise<ImportDraftMutationResult> {
  return apiPost(`${importPath(householdId, importFileId)}/drafts/${draftId}/decision?${changeQuery(version)}`,
    { decision, acknowledgePossibleDuplicate })
}
export function deleteImportDraft(householdId: string, importFileId: string,
  draftId: string, version: string): Promise<ImportDraftMutationResult> {
  return apiDelete<ImportDraftMutationResult>(`${importPath(householdId, importFileId)}/drafts/${draftId}?${changeQuery(version)}`)
}

export function uploadCsvImport(
  householdId: string,
  accountId: string,
  file: File,
  allowDuplicateFile: boolean,
  profileId?: string,
  worksheetId?: string,
): Promise<CsvImportResult> {
  const form = new FormData()
  form.append('accountId', accountId)
  form.append('file', file)
  form.append('allowDuplicateFile', String(allowDuplicateFile))
  if (profileId) form.append('profileId', profileId)
  if (worksheetId) form.append('worksheetId', worksheetId)

  return apiPostForm<CsvImportResult>(
    `/api/households/${householdId}/imports`,
    form,
  )
}

export function getImports(householdId: string, filter: ImportListFilter = 'inProgress', page = 1, signal?: AbortSignal): Promise<ImportListResult> {
  const status = { inProgress: 'Unfinished', completed: 'Completed', all: 'All', ready: 'ReadyForReview' }[filter]
  const query = new URLSearchParams({ filter: status, page: String(page) })
  return apiGet(`/api/households/${householdId}/imports?${query}`, signal)
}

export function getImportSummary(householdId: string): Promise<ImportSummary> {
  return apiGet(`/api/households/${householdId}/imports/summary`)
}

export function getImport(
  householdId: string,
  importFileId: string,
  signal?: AbortSignal,
): Promise<ImportReviewDetail> {
  // A malformed deep link must not resolve to the literal /summary endpoint.
  if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i.test(importFileId)) {
    return Promise.reject(new Error('This import link is invalid. Choose an import from the list.'))
  }
  return apiGet(`/api/households/${householdId}/imports/${encodeURIComponent(importFileId)}`, signal)
}

export function checkImportDuplicates(
  householdId: string,
  importFileId: string,
): Promise<void> {
  return apiPost(
    `/api/households/${householdId}/imports/${importFileId}/check-duplicates`,
    {},
  )
}

export function applyImportCategorizationRules(
  householdId: string,
  importFileId: string,
  replaceExistingCategories: boolean,
): Promise<{ matchedRows: number; changedRows: number; unchangedRows: number }> {
  return apiPost<{
    matchedRows: number
    changedRows: number
    unchangedRows: number
  }>(
    `/api/households/${householdId}/imports/${importFileId}/apply-categorization-rules`,
    { replaceExistingCategories },
  )
}

export interface CategorizationRuleApplicationPreview {
  fillChangedRows: number
  reapplyChangedRows: number
  reapplyUnchangedRows: number
}

export function getImportCategorizationRulePreview(
  householdId: string,
  importFileId: string,
  signal?: AbortSignal,
): Promise<CategorizationRuleApplicationPreview> {
  return apiGet(
    `/api/households/${householdId}/imports/${importFileId}/categorization-rule-application-preview`,
    signal,
  )
}

export function updateImportDraft(
  householdId: string,
  importFileId: string,
  draftId: string,
  request: {
    transactionDate: string | null
    amount: number | null
    description: string | null
    selectedCategoryId: string | null
    includeInHouseholdBudget?: boolean
    includeInPersonalBudget?: boolean
  },
): Promise<void> {
  return apiPut(
    `/api/households/${householdId}/imports/${importFileId}/drafts/${draftId}`,
    request,
  )
}

export function bulkUpdateImportDrafts(
  householdId: string,
  importFileId: string,
  drafts: ImportDraftUpdate[],
): Promise<{ savedRows: number }> {
  return apiPut<{ savedRows: number }>(
    `/api/households/${householdId}/imports/${importFileId}/drafts`,
    { drafts },
  )
}

export function reviewImportDraft(
  householdId: string,
  importFileId: string,
  draftId: string,
  decision: 'Approved' | 'Excluded' | 'Pending',
  acknowledgePossibleDuplicate: boolean,
): Promise<void> {
  return apiPost(
    `/api/households/${householdId}/imports/${importFileId}/drafts/${draftId}/decision`,
    { decision, acknowledgePossibleDuplicate },
  )
}

export function bulkReviewImportDrafts(
  householdId: string,
  importFileId: string,
  decision: 'Approved' | 'Excluded' | 'Pending',
): Promise<void> {
  return apiPost(
    `/api/households/${householdId}/imports/${importFileId}/decisions`,
    { decision },
  )
}

export function removeImportDraft(
  householdId: string,
  importFileId: string,
  draftId: string,
): Promise<void> {
  return apiDelete(
    `/api/households/${householdId}/imports/${importFileId}/drafts/${draftId}`,
  )
}

export function completeImport(
  householdId: string,
  importFileId: string,
): Promise<CompleteImportResult> {
  return apiPost(
    `/api/households/${householdId}/imports/${importFileId}/complete`,
    {},
  )
}

export function discardImport(
  householdId: string,
  importFileId: string,
): Promise<void> {
  return apiDelete(`/api/households/${householdId}/imports/${importFileId}`)
}
