import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { uploadCsvImport, type CsvImportResult } from '../imports/importApi'
import { AppLink } from '../routing/AppLink'

const maxFileSizeBytes = 10 * 1024 * 1024

export function CsvImportPage() {
  const { currentHousehold } = useHouseholds()
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
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
    void getAccounts(currentHousehold.id)
      .then(items => {
        if (!isCurrent) {
          return
        }

        const activeAccounts = items.filter(account => account.isActive)
        setAccounts(activeAccounts)
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
      setResult(await uploadCsvImport(
        currentHousehold.id,
        selectedAccountId,
        selectedFile,
        allowDuplicateFile,
      ))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <main className="management-page">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BudgetApp</span>
        </div>
        <AppLink className="header-link" to="/dashboard">Dashboard</AppLink>
      </header>

      <section className="management-content import-content">
        <div className="page-title-row">
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
                onChange={event => setSelectedFile(event.target.files?.[0] ?? null)}
              />
              <small>Maximum 10 MB and 10,000 transaction rows.</small>
            </label>

            <div className="csv-format-note">
              <h2>Supported columns</h2>
              <p>
                Include Date, Description, and Amount columns, or use separate Debit and Credit
                columns. Dates may use YYYY-MM-DD or MM/DD/YYYY.
              </p>
              <p>Negative amounts are money out; positive amounts are money in.</p>
              <a
                className="download-template-link"
                href="/budgetapp-import-template.csv"
                download="budgetapp-import-template.csv"
              >
                Download default CSV template
              </a>
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
              Row review and approval will be available in the next import-review feature.
            </p>
          </section>
        )}
      </section>
    </main>
  )
}
