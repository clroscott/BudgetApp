import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { TransactionsSectionNav } from '../components/TransactionsSectionNav'
import { useHouseholds } from '../households/useHouseholds'
import { ContextualHelp } from '../components/ContextualHelp'
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
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { ImportParsingFields } from '../imports/ImportParsingFields'

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
  const householdId = currentHousehold?.id
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [profiles, setProfiles] = useState<ImportProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [inspection, setInspection] = useState<ImportProfileInspection | null>(null)
  const [mapping, setMapping] = useState<SaveImportProfile | null>(null)
  const [allowDuplicateFile, setAllowDuplicateFile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const revision = useRef(0)
  const pending = useRef(false)
  const isExcel = selectedFile?.name.toLowerCase().endsWith('.xlsx') ?? false
  const confirmDiscard = useUnsavedChangesGuard(
    Boolean(selectedFile) && !result, 'Leave your transaction upload or mapping before it has been imported?',
  )

  useEffect(() => {
    const contextRevision = revision
    contextRevision.current++
    pending.current = false
    setIsUploading(false)
    setSelectedFile(null)
    setSelectedProfileId('')
    setInspection(null)
    setMapping(null)
    setResult(null)
    setAllowDuplicateFile(false)
    setAccounts([])
    setProfiles([])
    setHasLoadedAccounts(false)
    if (!householdId) {
      setIsLoading(false)
      return
    }

    let isCurrent = true
    setIsLoading(true)
    setErrors([])
    void Promise.all([
      getAccounts(householdId),
      getImportProfiles(householdId),
    ])
      .then(([items, profileItems]) => {
        if (!isCurrent) {
          return
        }

        const activeAccounts = items.filter(account => account.isActive)
        setAccounts(activeAccounts)
        setHasLoadedAccounts(true)
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
      contextRevision.current++
    }
  }, [householdId, loadAttempt])

  const selectedAccount = useMemo(
    () => accounts.find(account => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )

  if (!currentHousehold) {
    return null
  }

  const startRequest = () => {
    if (pending.current) return null
    pending.current = true
    setIsUploading(true)
    setErrors([])
    return ++revision.current
  }
  const finishRequest = (request: number) => {
    if (request !== revision.current) return
    pending.current = false
    setIsUploading(false)
  }
  const offerMapping = (inspected: ImportProfileInspection) => {
    const suggested = inspected.suggestedProfile
    setMapping(!selectedProfileId && !inspected.matchedProfile &&
      !isStandardCsvStructure(inspected.headers) && suggested ? {
        ...suggested, defaultAccountId: selectedAccountId,
      } : null)
  }
  const upload = (profileId?: string, worksheetId?: string) => worksheetId
    ? uploadCsvImport(currentHousehold.id, selectedAccountId, selectedFile!, allowDuplicateFile, profileId, worksheetId)
    : profileId
      ? uploadCsvImport(currentHousehold.id, selectedAccountId, selectedFile!, allowDuplicateFile, profileId)
      : uploadCsvImport(currentHousehold.id, selectedAccountId, selectedFile!, allowDuplicateFile)

  const selectWorksheet = async (worksheetId: string) => {
    if (!selectedFile) return
    if (mapping && !confirmDiscard()) return
    const request = startRequest()
    if (request === null) return
    try {
      const inspected = await inspectImportFile(currentHousehold.id, selectedAccountId, selectedFile, worksheetId)
      if (request !== revision.current) return
      setInspection(inspected)
      offerMapping(inspected)
      setResult(null)
    } catch (error) {
      if (request === revision.current) setErrors(getErrorMessages(error))
    } finally { finishRequest(request) }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending.current) return
    setErrors([])
    setResult(null)

    if (!selectedFile) {
      setErrors(['Select a CSV or Excel (.xlsx) file to import.'])
      return
    }

    if (selectedFile.size > maxFileSizeBytes) {
      setErrors(['Import files cannot exceed 10 MB.'])
      return
    }

    if (!selectedAccountId) {
      setErrors(['Create an active account before importing transactions.'])
      return
    }

    const request = startRequest()
    if (request === null) return
    try {
      let inspected = inspection
      if ((isExcel && !inspected) || (!isExcel && !selectedProfileId)) {
        inspected = await inspectImportFile(currentHousehold.id, selectedAccountId, selectedFile)
        if (request !== revision.current) return
        setInspection(inspected)
        offerMapping(inspected)
        // Always show the worksheet/preview before staging an Excel workbook.
        if (isExcel) return
      }
      if (isExcel && !inspected?.selectedWorksheetId) {
        setErrors(['Choose a worksheet before uploading for review.'])
        return
      }
      const profileId = selectedProfileId || inspected?.matchedProfile?.id
      if (!profileId && inspected && !isStandardCsvStructure(inspected.headers)) {
        offerMapping(inspected)
        return
      }
      const staged = await upload(profileId, isExcel ? inspected?.selectedWorksheetId ?? undefined : undefined)
      if (request !== revision.current) return
      setMapping(null)
      setResult(staged)
    } catch (error) {
      if (request === revision.current) setErrors(getErrorMessages(error))
    } finally {
      finishRequest(request)
    }
  }

  const saveMappingAndUpload = async () => {
    if (!mapping || !selectedFile) return
    if (isExcel && !inspection?.selectedWorksheetId) return
    const request = startRequest()
    if (request === null) return
    try {
      const profile = await createImportProfile(currentHousehold.id, mapping)
      if (request !== revision.current) return
      setProfiles(current => [...current, profile])
      setSelectedProfileId(profile.id)
      setMapping(null)
      const staged = await upload(profile.id, isExcel ? inspection?.selectedWorksheetId ?? undefined : undefined)
      if (request === revision.current) setResult(staged)
    } catch (error) {
      if (request === revision.current) setErrors(getErrorMessages(error))
    } finally {
      finishRequest(request)
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
        <TransactionsSectionNav />
        <div className="page-title-row" data-tutorial-id="csv-import-page-title">
          <div>
            <p className="eyebrow">Transactions</p>
            <h1>Import transactions</h1>
            <p>Upload bank transactions into a review area before they affect your budget.</p>
            <p>During review, choose “My personal budget”, “Household budget”, or both for each row.
              Upload each transaction only once.</p>
          </div>
        </div>

        <div className="contextual-help-row">
          <ContextualHelp topic="import-approval" />
          <ContextualHelp topic="scope-privacy" />
        </div>
        <ErrorSummary errors={errors} />

        {isLoading ? (
          <p className="empty-state">Loading accounts...</p>
        ) : !hasLoadedAccounts ? (
          <div className="empty-state">
            <h2>Could not load accounts and import profiles</h2>
            <p>Retry loading before selecting a file. No import was created.</p>
            <button className="secondary-button" type="button" onClick={() => setLoadAttempt(value => value + 1)}>Retry loading</button>
          </div>
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
                disabled={isUploading}
                value={selectedAccountId}
                onChange={event => {
                  if (mapping && !confirmDiscard()) return
                  revision.current++
                  setSelectedAccountId(event.target.value)
                  setInspection(null)
                  setMapping(null)
                  setResult(null)
                }}
              >
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.currency}, {account.scope.toLowerCase()})
                  </option>
                ))}
              </select>
            </label>

            <label className="file-drop-field">
              <span>CSV or Excel file</span>
              <input
                key={currentHousehold.id}
                disabled={isUploading}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onClick={event => {
                  if (mapping && !confirmDiscard()) event.preventDefault()
                }}
                onChange={event => {
                  revision.current++
                  setSelectedFile(event.target.files?.[0] ?? null)
                  setInspection(null)
                  setMapping(null)
                  setResult(null)
                }}
              />
              <small>CSV or modern Excel (.xlsx). Maximum 10 MB and 10,000 transaction rows per worksheet. No .xls, macros, or password-protected workbooks.</small>
            </label>

            <label>
              <span>Import profile</span>
              <select value={selectedProfileId} disabled={isUploading}
                onChange={event => {
                  if (mapping && !confirmDiscard()) return
                  revision.current++
                  setSelectedProfileId(event.target.value)
                  if (!isExcel) setInspection(null)
                  setMapping(null)
                  setResult(null)
                }}>
                <option value="">Standard format / detect automatically</option>
                {profiles.map(profile => <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>)}
              </select>
              <small>Known header structures are selected automatically.</small>
            </label>

            <div className="csv-format-note">
              <h2>File structures</h2>
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
                disabled={isUploading}
                checked={allowDuplicateFile}
                onChange={event => setAllowDuplicateFile(event.target.checked)}
              />
              <span>Allow this file to be imported again if its contents match an earlier upload.</span>
            </label>

            <button
              className="primary-button import-submit"
              type="submit"
              disabled={isUploading || !selectedFile || !selectedAccount || Boolean(isExcel && inspection && !inspection.selectedWorksheetId) || Boolean(mapping)}
            >
              {isUploading ? 'Reading and checking...' : isExcel && !inspection ? 'Preview workbook' : 'Upload for review'}
            </button>
          </form>
        )}

        {isExcel && inspection && !result && (
          <section className="management-form import-mapping-panel" aria-label="Excel worksheet preview">
            <h2>Choose one worksheet</h2>
            <p>Only this worksheet will be staged. Worksheets are never combined.</p>
            <label><span>Worksheet</span>
              <select value={inspection.selectedWorksheetId ?? ''} disabled={isUploading}
                onChange={event => { if (event.target.value) void selectWorksheet(event.target.value) }}>
                <option value="" disabled>Select a worksheet</option>
                {inspection.worksheets?.map(sheet => <option key={sheet.id} value={sheet.id} disabled={Boolean(sheet.problem)}>
                  {sheet.name}{sheet.isHidden ? ' (hidden)' : ''} — {sheet.problem ?? `${sheet.transactionRows} transaction rows`}
                </option>)}
              </select>
            </label>
            {inspection.selectedWorksheetName && <p>Selected worksheet: <strong>{inspection.selectedWorksheetName}</strong></p>}
            {!selectedProfileId && inspection.matchedProfile && <p>Using saved profile: <strong>{inspection.matchedProfile.name}</strong>.</p>}
            <p className="field-help">Formulas are never run. Only saved results are read, which may be outdated. Recalculate and save in Excel first; cells without usable saved results will need correction.</p>
            {inspection.selectedWorksheetId && <ImportPreview inspection={inspection} />}
          </section>
        )}

        {inspection && mapping && (
          <section className="management-form import-mapping-panel">
            <div><p className="eyebrow">New file structure</p>
              <h2>Map these columns once</h2>
              <p>Save this mapping and future files with the same headers will be detected automatically.</p>
            </div>
            <div className="import-profile-grid">
              <label className="import-mapping-profile-name">
              <span>Profile name</span><input value={mapping.name} disabled={isUploading}
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
                }[field]}</span><select value={mapping[field] ?? ''} disabled={isUploading}
                  onChange={event => setMappingField(field, event.target.value || null)}>
                  <option value="">Not mapped</option>
                  {inspection.headers.map(header =>
                    <option key={header} value={header}>{header}</option>)}
                </select></label>
              ))}
              <label><span>Source amount signs</span><select
                value={mapping.amountConvention}
                disabled={isUploading}
                onChange={event => setMappingField('amountConvention', event.target.value)}>
                <option value="SpendingPositive">Positive means spending</option>
                <option value="MoneyInPositive">Positive means money in</option>
              </select></label>
              <ImportParsingFields dateFormat={mapping.dateFormat} numberCulture={mapping.numberCulture}
                disabled={isUploading} onChange={setMappingField} />
            </div>
            {!isExcel && <ImportPreview inspection={inspection} />}
            {currentHousehold.role === 'Viewer' && <p>Only a household Owner or Admin can save a shared import profile. Ask them to save this mapping, or choose an existing profile.</p>}
            <button className="primary-button" type="button" disabled={isUploading || currentHousehold.role === 'Viewer'}
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
              {result.sourceWorksheetName && <p>Worksheet: {result.sourceWorksheetName}</p>}
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

function ImportPreview({ inspection }: { inspection: ImportProfileInspection }) {
  return <div className="table-scroll-region" role="region" aria-label="Import preview" tabIndex={0}>
    <table className="import-preview-table">
      <caption>First five transaction rows (before applying profile formats)</caption>
      <thead><tr><th scope="col">Source row</th>{inspection.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
      <tbody>{inspection.previewRows.map((row, index) => <tr key={index}>
        <th scope="row">{inspection.previewRowNumbers?.[index] ?? index + 2}</th>
        {row.map((value, column) => <td key={column}>{value}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
}
