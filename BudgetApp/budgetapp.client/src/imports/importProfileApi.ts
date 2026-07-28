import { apiDelete, apiGet, apiPost, apiPostForm, apiPut } from '../api/apiClient'

export type AmountConvention = 'SpendingPositive' | 'MoneyInPositive'

export interface ImportProfile {
  id: string
  name: string
  headers: string[]
  dateColumn: string
  descriptionColumn: string
  amountColumn: string | null
  debitColumn: string | null
  creditColumn: string | null
  categoryColumn: string | null
  subcategoryColumn: string | null
  amountConvention: AmountConvention
  defaultAccountId: string | null
  isActive: boolean
}

export type SaveImportProfile = Omit<ImportProfile, 'id' | 'isActive'>

export interface ImportProfileInspection {
  headers: string[]
  previewRows: string[][]
  matchedProfile: ImportProfile | null
  suggestedProfile: ImportProfile
}

const base = (householdId: string) =>
  `/api/households/${householdId}/import-profiles`

export function getImportProfiles(
  householdId: string,
  includeInactive = false,
): Promise<ImportProfile[]> {
  return apiGet(`${base(householdId)}?includeInactive=${includeInactive}`)
}

export function createImportProfile(
  householdId: string,
  profile: SaveImportProfile,
): Promise<ImportProfile> {
  return apiPost(base(householdId), profile)
}

export function updateImportProfile(
  householdId: string,
  profileId: string,
  profile: SaveImportProfile,
): Promise<ImportProfile> {
  return apiPut(`${base(householdId)}/${profileId}`, profile)
}

export function setImportProfileActive(
  householdId: string,
  profileId: string,
  active: boolean,
): Promise<void> {
  return apiPost(
    `${base(householdId)}/${profileId}/${active ? 'reactivate' : 'deactivate'}`,
    {},
  )
}

export function deleteImportProfile(
  householdId: string,
  profileId: string,
): Promise<void> {
  return apiDelete(`${base(householdId)}/${profileId}`)
}

export function inspectImportFile(
  householdId: string,
  accountId: string,
  file: File,
): Promise<ImportProfileInspection> {
  const form = new FormData()
  form.append('accountId', accountId)
  form.append('file', file)
  return apiPostForm(`${base(householdId)}/inspect`, form)
}

export function importProfileTemplateUrl(
  householdId: string,
  profileId: string,
) {
  return `${base(householdId)}/${profileId}/template`
}
