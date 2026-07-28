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
  rejectedRows: number
  skippedRows: number
  duplicateRows: number
  uploadedAtUtc: string
  canEdit: boolean
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
  approvedTransactionId: string | null
}

export interface ImportReviewDetail extends Omit<ImportListItem, 'uploadedAtUtc'> {
  currency: string
  drafts: ImportDraftItem[]
}

export interface CompleteImportResult {
  importFileId: string
  createdTransactionCount: number
  approvedRows: number
  rejectedRows: number
  skippedRows: number
  status: string
}

export function uploadCsvImport(
  householdId: string,
  accountId: string,
  file: File,
  allowDuplicateFile: boolean,
  profileId?: string,
): Promise<CsvImportResult> {
  const form = new FormData()
  form.append('accountId', accountId)
  form.append('file', file)
  form.append('allowDuplicateFile', String(allowDuplicateFile))
  if (profileId) form.append('profileId', profileId)

  return apiPostForm<CsvImportResult>(
    `/api/households/${householdId}/imports`,
    form,
  )
}

export function getImports(householdId: string): Promise<ImportListItem[]> {
  return apiGet(`/api/households/${householdId}/imports`)
}

export function getImport(
  householdId: string,
  importFileId: string,
): Promise<ImportReviewDetail> {
  return apiGet(`/api/households/${householdId}/imports/${importFileId}`)
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

export function updateImportDraft(
  householdId: string,
  importFileId: string,
  draftId: string,
  request: {
    transactionDate: string | null
    amount: number | null
    description: string | null
    selectedCategoryId: string | null
  },
): Promise<void> {
  return apiPut(
    `/api/households/${householdId}/imports/${importFileId}/drafts/${draftId}`,
    request,
  )
}

export function reviewImportDraft(
  householdId: string,
  importFileId: string,
  draftId: string,
  decision: 'Approved' | 'Rejected' | 'Skipped',
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
  decision: 'Approved' | 'Rejected' | 'Skipped',
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
