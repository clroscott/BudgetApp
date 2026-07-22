import { apiPostForm } from '../api/apiClient'

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

export function uploadCsvImport(
  householdId: string,
  accountId: string,
  file: File,
  allowDuplicateFile: boolean,
): Promise<CsvImportResult> {
  const form = new FormData()
  form.append('accountId', accountId)
  form.append('file', file)
  form.append('allowDuplicateFile', String(allowDuplicateFile))

  return apiPostForm<CsvImportResult>(
    `/api/households/${householdId}/imports`,
    form,
  )
}
