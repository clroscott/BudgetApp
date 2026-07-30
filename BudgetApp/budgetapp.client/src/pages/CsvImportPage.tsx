import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { uploadCsvImport, type CsvImportResult } from '../imports/importApi'
import {
  createImportProfile,
  getImportProfiles,
  importProfileTemplateUrl,
  inspectImportFile,
  type ImportProfile,
  type ImportProfileInspection,
  type SaveImportProfile,
} from '../imports/importProfileApi'
import { AppLink } from '../routing/AppLink'

const maxFileSizeBytes = 10 * 1024 * 1024
const standardCsvHeaders = new Set([
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'category',
  'subcategory',
])

function isStandardCsvStructure(headers: string[]) {
  const normalized = headers.map(header => header.trim().toLowerCase())
  return normalized.includes('date') &&
    normalized.includes('description') &&
    (normalized.includes('amount') ||
      normalized.includes('debit') ||
      normalized.includes('credit')) &&
    normalized.every(header => standardCsvHeaders.has(header))
}

export function CsvImportPage() {
  const { currentHousehold } = useHouseholds()
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [profiles, setProfiles] = useState<ImportProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [inspection, setInspection] = useState<ImportProfileInspection | null>(null)
  const [mapping, setMapping] = useState<SaveImportProfile | null>(null)
  const [allowDuplicateFile, setAllowDuplicateFile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [result, setResult] = useState<CsvImportResult | null>(null)

  useEffect(() => {
    if (!currentHousehold) {
      return
    }

    let isCurrent = true
    setIsLoading(true)
    setErrors([])
    void Promise.all([
      getAccounts(currentHousehold.id),
      getImportProfiles(currentHousehold.id),
    ])
      .then(([items, profileItems]) => {
        if (!isCurrent) {
          return
        }

        const activeAccounts = items.filter(account => account.isActive)
        setAccounts(activeAccounts)
        setProfiles(profileItems)
        setSelectedAccountId(current =>
          activeAccounts.some(account => account.id === current)
            ? current
            : activeAccounts[0]?.id ?? '')
      })
      .catch(error => {
        if (isCurrent) {
          setErrors(getErrorMessages(error))
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [currentHousehold])

  const selectedAccount = useMemo(
    () => accounts.find(account => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )

  if (!currentHousehold) {
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrors([])
    setResult(null)

    if (!selectedFile) {
      setErrors(['Select a CSV file to import.'])
      return
    }

    if (selectedFile.size > maxFileSizeBytes) {
      setErrors(['CSV files cannot exceed 10 MB.'])
      return
    }

    if (!selectedAccountId) {
      setErrors(['Create an active account before importing transactions.'])
      return
    }

    setIsUploading(true)
    try {
      let profileId = selectedProfileId
      if (!profileId) {
        const inspected = await inspectImportFile(
          currentHousehold.id, selectedAccountId, selectedFile)
        if (!inspected.matchedProfile) {
          if (isStandardCsvStructure(inspected.headers)) {
            setInspection(null)
            setMapping(null)
            setResult(await uploadCsvImport(
              currentHousehold.id,
              selectedAccountId,
              selectedFile,
              allowDuplicateFile,
            ))
            return
          }

          setInspection(inspected)
          setMapping({
            name: inspected.suggestedProfile.name,
            headers: inspected.headers,
            dateColumn: inspected.suggestedProfile.dateColumn,
            descriptionColumn: inspected.suggestedProfile.descriptionColumn,
            amountColumn: inspected.suggestedProfile.amountColumn,
            debitColumn: inspected.suggestedProfile.debitColumn,
            creditColumn: inspected.suggestedProfile.creditColumn,
            categoryColumn: inspected.suggestedProfile.categoryColumn,
            subcategoryColumn: inspected.suggestedProfile.subcategoryColumn,
            amountConvention: inspected.suggestedProfile.amountConvention,
            defaultAccountId: selectedAccountId,
          })
          return
        }
        profileId = inspected.matchedProfile.id
        setSelectedProfileId(profileId)
      }
      setResult(await uploadCsvImport(
        currentHousehold.id, selectedAccountId, selectedFile,
        allowDuplicateFile, profileId))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsUploading(false)
    }
  }

  const saveMappingAndUpload = async () => {
    if (!mapping || !selectedFile) return
    setIsUploading(true)
    setErrors([])
    try {
      const profile = await createImportProfile(currentHousehold.id, mapping)
      setProfiles(current => [...current, profile])
      setSelectedProfileId(profile.id)
      setInspection(null)
      setMapping(null)
      setResult(await uploadCsvImport(
        currentHousehold.id, selectedAccountId, selectedFile,
        allowDuplicateFile, profile.id))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsUploading(false)
    }
  }

  const setMappingField = (field: keyof SaveImportProfile, value: string | null) =>
    setMapping(current => current ? { ...current, [field]: value } : current)

  return (
    <main className="management-page">
      <header className="app-header">
        <BrandLockup />
        <AppLink className="header-link" to="/dashboard">Return to dashboard</AppLink>
      </header>

      <section className="management-content import-content">
        <div className="page-title-row" data-tutorial-id="csv-import-page-title">
          <div>
            <p className="eyebrow">Transactions</p>
            <h1>Import CSV</h1>
            <p>Upload bank transactions into a review area before they affect your budget.</p>
          </div>
        </div>

        <ErrorSummary errors={errors} />

        {isLoading ? (
          <p className="empty-state">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <div className="empty-state">
            <h2>No active accounts</h2>
            <p>Create or reactivate an account before uploading transactions.</p>
            <AppLink to="/accounts">Manage accounts</AppLink>
          </div>
        ) : (
          <form className="import-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              <span>Import into account</span>
              <select
                value={selectedAccountId}
                onChange={event => setSelectedAccountId(event.target.value)}
              >
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.currency}, {account.scope.toLowerCase()})
                  </option>
                ))}
              </select>
            </label>

            <label className="file-drop-field">
              <span>CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={event => {
                  setSelectedFile(event.target.files?.[0] ?? null)
                  setInspection(null)
                  setMapping(null)
                  setResult(null)
                }}
              />
              <small>Maximum 10 MB and 10,000 transaction rows.</small>
            </label>

            <label>
              <span>CSV profile</span>
              <select value={selectedProfileId}
                onChange={event => setSelectedProfileId(event.target.value)}>
                <option value="">Standard format / detect automatically</option>
                {profiles.map(profile => <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>)}
              </select>
              <small>Known header structures are selected automatically.</small>
            </label>

            <div className="csv-format-note">
              <h2>CSV structures</h2>
              <p>BudgetApp remembers each bank or custom structure after it is mapped once.</p>
              <p>Positive amounts are spending; negative amounts are income, refunds, or credits.</p>
              {selectedProfileId ? <a
                className="download-template-link"
                href={importProfileTemplateUrl(currentHousehold.id, selectedProfileId)}
              >
                Download selected profile template
              </a> : <a className="download-template-link"
                href="/budgetapp-import-template.csv" download="budgetapp-import-template.csv">
                Download standard CSV template
              </a>}
              {' · '}<AppLink to="/settings/import-profiles">Manage profiles</AppLink>
            </div>

            <label className="checkbox-row duplicate-file-confirmation">
              <input
                type="checkbox"
                checked={allowDuplicateFile}
                onChange={event => setAllowDuplicateFile(event.target.checked)}
              />
              <span>Allow this file to be imported again if its contents match an earlier upload.</span>
            </label>

            <button
              className="primary-button import-submit"
              type="submit"
              disabled={isUploading || !selectedFile || !selectedAccount}
            >
              {isUploading ? 'Uploading and checking...' : 'Upload for review'}
            </button>
          </form>
        )}

        {inspection && mapping && (
          <section className="management-form import-mapping-panel">
            <div><p className="eyebrow">New CSV structure</p>
              <h2>Map these columns once</h2>
              <p>Save this mapping and future files with the same headers will be detected automatically.</p>
            </div>
            <div className="import-profile-grid">
              <label className="import-mapping-profile-name">
                <span>Profile name</span><input value={mapping.name}
                onChange={event => setMappingField('name', event.target.value)} /></label>
              {(['dateColumn', 'descriptionColumn', 'amountColumn', 'debitColumn',
                'creditColumn', 'categoryColumn', 'subcategoryColumn'] as const).map(field => (
                <label key={field}><span>{{
                  dateColumn: 'Date',
                  descriptionColumn: 'Description',
                  amountColumn: 'Amount',
                  debitColumn: 'Debit / spending',
                  creditColumn: 'Credit / money in',
                  categoryColumn: 'Category',
                  subcategoryColumn: 'Subcategory',
                }[field]}</span><select value={mapping[field] ?? ''}
                  onChange={event => setMappingField(field, event.target.value || null)}>
                  <option value="">Not mapped</option>
                  {inspection.headers.map(header =>
                    <option key={header} value={header}>{header}</option>)}
                </select></label>
              ))}
              <label><span>Source amount signs</span><select
                value={mapping.amountConvention}
                onChange={event => setMappingField('amountConvention', event.target.value)}>
                <option value="SpendingPositive">Positive means spending</option>
                <option value="MoneyInPositive">Positive means money in</option>
              </select></label>
            </div>
            <div className="csv-preview-table">
              <div>{inspection.headers.map(header => <strong key={header}>{header}</strong>)}</div>
              {inspection.previewRows.map((row, index) =>
                <div key={index}>{row.map((value, column) =>
                  <span key={`${index}-${column}`}>{value}</span>)}</div>)}
            </div>
            <button className="primary-button" type="button" disabled={isUploading}
              onClick={() => void saveMappingAndUpload()}>
              {isUploading ? 'Saving and uploading...' : 'Save profile and upload'}
            </button>
          </section>
        )}

        {result && (
          <section className="import-result" aria-live="polite">
            <div>
              <p className="eyebrow">Ready for review</p>
              <h2>{result.originalFileName}</h2>
              <p>Staged for {result.accountName}. No official transactions were created.</p>
            </div>
            <div className="import-stat-grid">
              <span><strong>{result.totalRows}</strong>Total rows</span>
              <span><strong>{result.validRows}</strong>Valid</span>
              <span><strong>{result.invalidRows}</strong>Needs correction</span>
            </div>
            <p className="field-help">
              Review every row before creating official transactions.
            </p>
            <AppLink to={`/imports/review?importId=${result.importFileId}`}>
              Review this import
            </AppLink>
          </section>
        )}
      </section>
    </main>
  )
}
