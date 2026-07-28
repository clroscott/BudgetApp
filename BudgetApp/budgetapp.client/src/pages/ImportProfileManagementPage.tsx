import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import {
  createImportProfile,
  deleteImportProfile,
  getImportProfiles,
  importProfileTemplateUrl,
  setImportProfileActive,
  updateImportProfile,
  type AmountConvention,
  type ImportProfile,
  type SaveImportProfile,
} from '../imports/importProfileApi'
import { AppLink } from '../routing/AppLink'

type ImportColumnField =
  'ignore' | 'date' | 'description' | 'amount' | 'debit' | 'credit' |
  'category' | 'subcategory'

interface ImportProfileColumn {
  key: number
  header: string
  field: ImportColumnField
}

const mappingDescriptions: Record<ImportColumnField, string> = {
  ignore: 'BudgetApp skips this column completely.',
  date: 'The date the transaction occurred or was posted.',
  description: 'The transaction label, payee, or merchant name.',
  amount: 'Use when one column contains both spending and money in. Signs distinguish them.',
  debit: 'Use when the CSV has a separate column for purchases, withdrawals, or fees.',
  credit: 'Use when the CSV has a separate column for deposits, refunds, or income.',
  category: 'An optional category name to match against an existing BudgetApp category.',
  subcategory: 'An optional subcategory name to match under an existing category.',
}

let nextColumnKey = 10

const createDefaultColumns = (): ImportProfileColumn[] => [
  { key: 1, header: 'Date', field: 'date' },
  { key: 2, header: 'Description', field: 'description' },
  { key: 3, header: 'Amount', field: 'amount' },
  { key: 4, header: 'Category', field: 'category' },
  { key: 5, header: 'Subcategory', field: 'subcategory' },
]

const emptyForm: SaveImportProfile = {
  name: '',
  headers: ['Date', 'Description', 'Amount', 'Category', 'Subcategory'],
  dateColumn: 'Date',
  descriptionColumn: 'Description',
  amountColumn: 'Amount',
  debitColumn: null,
  creditColumn: null,
  categoryColumn: 'Category',
  subcategoryColumn: 'Subcategory',
  amountConvention: 'SpendingPositive',
  defaultAccountId: null,
}

export function ImportProfileManagementPage() {
  const { currentHousehold } = useHouseholds()
  const [profiles, setProfiles] = useState<ImportProfile[]>([])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [form, setForm] = useState<SaveImportProfile>(emptyForm)
  const [columns, setColumns] = useState<ImportProfileColumn[]>(createDefaultColumns)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const canEdit = currentHousehold?.role !== 'Viewer'
  const headers = useMemo(
    () => columns.map(column => column.header.trim()).filter(Boolean),
    [columns],
  )
  const activeProfiles = profiles.filter(profile => profile.isActive)
  const inactiveProfiles = profiles.filter(profile => !profile.isActive)

  const load = async () => {
    if (!currentHousehold) return
    const [profileItems, accountItems] = await Promise.all([
      getImportProfiles(currentHousehold.id, true),
      getAccounts(currentHousehold.id),
    ])
    setProfiles(profileItems)
    setAccounts(accountItems.filter(account => account.isActive))
  }

  useEffect(() => {
    setErrors([])
    void load().catch(error => setErrors(getErrorMessages(error)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHousehold?.id])

  if (!currentHousehold) return null

  const setField = <K extends keyof SaveImportProfile>(
    field: K,
    value: SaveImportProfile[K],
  ) => setForm(current => ({ ...current, [field]: value }))

  const reset = () => {
    setEditingId(null)
    setForm(emptyForm)
    setColumns(createDefaultColumns())
  }

  const edit = (profile: ImportProfile) => {
    setEditingId(profile.id)
    setForm({
      name: profile.name,
      headers: profile.headers,
      dateColumn: profile.dateColumn,
      descriptionColumn: profile.descriptionColumn,
      amountColumn: profile.amountColumn,
      debitColumn: profile.debitColumn,
      creditColumn: profile.creditColumn,
      categoryColumn: profile.categoryColumn,
      subcategoryColumn: profile.subcategoryColumn,
      amountConvention: profile.amountConvention,
      defaultAccountId: profile.defaultAccountId,
    })
    setColumns(profile.headers.map(header => ({
      key: nextColumnKey++,
      header,
      field: header === profile.dateColumn ? 'date'
        : header === profile.descriptionColumn ? 'description'
          : header === profile.amountColumn ? 'amount'
            : header === profile.debitColumn ? 'debit'
              : header === profile.creditColumn ? 'credit'
                : header === profile.categoryColumn ? 'category'
                  : header === profile.subcategoryColumn ? 'subcategory'
                    : 'ignore',
    })))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsBusy(true)
    setErrors([])
    try {
      const headerFor = (field: ImportColumnField) =>
        columns.find(column => column.field === field)?.header.trim() || null
      const request: SaveImportProfile = {
        ...form,
        headers,
        dateColumn: headerFor('date') ?? '',
        descriptionColumn: headerFor('description') ?? '',
        amountColumn: headerFor('amount'),
        debitColumn: headerFor('debit'),
        creditColumn: headerFor('credit'),
        categoryColumn: headerFor('category'),
        subcategoryColumn: headerFor('subcategory'),
      }
      if (editingId)
        await updateImportProfile(currentHousehold.id, editingId, request)
      else
        await createImportProfile(currentHousehold.id, request)
      reset()
      await load()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsBusy(false)
    }
  }

  const updateColumnHeader = (key: number, header: string) =>
    setColumns(current => current.map(column =>
      column.key === key ? { ...column, header } : column))

  const updateColumnField = (key: number, field: ImportColumnField) =>
    setColumns(current => current.map(column => {
      if (column.key === key) return { ...column, field }
      if (field !== 'ignore' && column.field === field)
        return { ...column, field: 'ignore' }
      if (field === 'amount' &&
          (column.field === 'debit' || column.field === 'credit'))
        return { ...column, field: 'ignore' }
      if ((field === 'debit' || field === 'credit') && column.field === 'amount')
        return { ...column, field: 'ignore' }
      return column
    }))

  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= columns.length) return
    setColumns(current => {
      const reordered = [...current]
      ;[reordered[index], reordered[target]] =
        [reordered[target], reordered[index]]
      return reordered
    })
  }

  const removeColumn = (key: number) =>
    setColumns(current => current.filter(column => column.key !== key))

  const addColumn = () =>
    setColumns(current => [...current, {
      key: nextColumnKey++,
      header: '',
      field: 'ignore',
    }])

  const changeActiveState = async (profile: ImportProfile) => {
    setIsBusy(true)
    setErrors([])
    try {
      await setImportProfileActive(
        currentHousehold.id, profile.id, !profile.isActive)
      await load()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsBusy(false)
    }
  }

  const deletePermanently = async (profile: ImportProfile) => {
    if (!window.confirm(
      `Permanently delete the "${profile.name}" import profile? This cannot be undone.`,
    )) return

    setIsBusy(true)
    setErrors([])
    try {
      await deleteImportProfile(currentHousehold.id, profile.id)
      if (editingId === profile.id) reset()
      await load()
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsBusy(false)
    }
  }

  const usesAmount = columns.some(column => column.field === 'amount')
  const hasDate = columns.some(column => column.field === 'date')
  const hasDescription = columns.some(column => column.field === 'description')
  const hasDebitOrCredit = columns.some(column =>
    column.field === 'debit' || column.field === 'credit')
  const hasDuplicateHeaders = new Set(headers.map(header => header.toLowerCase())).size !==
    headers.length
  const canSubmit = Boolean(
    form.name.trim() &&
    columns.length > 0 &&
    headers.length === columns.length &&
    !hasDuplicateHeaders &&
    hasDate &&
    hasDescription &&
    (usesAmount || hasDebitOrCredit),
  )
  const renderProfile = (profile: ImportProfile) => (
    <article className={`account-card${profile.isActive ? '' : ' inactive-row'}`} key={profile.id}>
      <div className="account-card-main"><div>
        <h3>{profile.name}</h3>
        <p>{profile.headers.join(' · ')}</p>
        <small>{profile.amountColumn ? 'Amount' : 'Debit/Credit'} · {profile.amountConvention}</small>
      </div></div>
      <div className="account-actions">
        <a className="secondary-button" href={importProfileTemplateUrl(currentHousehold.id, profile.id)}>
          Download template
        </a>
        {canEdit && profile.isActive && (
          <button className="secondary-button" type="button" disabled={isBusy}
            onClick={() => edit(profile)}>Edit</button>
        )}
        {canEdit && (
          <button className={profile.isActive ? 'danger-button' : 'secondary-button'}
            type="button" disabled={isBusy}
            onClick={() => void changeActiveState(profile)}>
            {profile.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
        {canEdit && !profile.isActive && (
          <button className="danger-button" type="button" disabled={isBusy}
            onClick={() => void deletePermanently(profile)}>
            Delete permanently
          </button>
        )}
      </div>
    </article>
  )

  return (
    <main className="management-page">
      <header className="app-header">
        <BrandLockup />
        <AppLink className="header-link" to="/import">Import CSV</AppLink>
      </header>
      <section className="management-content import-profile-content">
        <div className="page-title-row"><div>
          <p className="eyebrow">Import settings</p>
          <h1>CSV import profiles</h1>
          <p>Save a bank or custom CSV structure once, then reuse it automatically.</p>
        </div></div>
        <ErrorSummary errors={errors} />
        {canEdit && <form className="management-form import-profile-form" onSubmit={event => void submit(event)}>
          <div className="account-form-heading"><div>
            <h2>{editingId ? 'Edit profile' : 'Create profile'}</h2>
            <p>Name each CSV column and choose what BudgetApp should do with it.</p>
          </div>{editingId && <button className="text-button" type="button" onClick={reset}>Cancel</button>}</div>
          <div className="import-profile-details-grid">
            <label><span>Profile name</span><input value={form.name} maxLength={100}
              placeholder="Example: Joint chequing CSV"
              onChange={event => setField('name', event.target.value)} /></label>
            <label><span>Preferred account</span><select
              value={form.defaultAccountId ?? ''}
              onChange={event => setField('defaultAccountId', event.target.value || null)}>
              <option value="">Any account</option>
              {accounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}
            </select></label>
          </div>
          <div className="import-profile-column-builder">
            <div className="import-profile-column-heading">
              <div>
                <h3>CSV columns</h3>
                <p>
                  CSV header is the exact title in the file. Maps to tells BudgetApp
                  what that column means.
                </p>
              </div>
              <button className="secondary-button" type="button" onClick={addColumn}>
                Add column
              </button>
            </div>
            <div className="import-profile-mapping-guide">
              <strong>Choosing an amount mapping</strong>
              <p>
                Choose <b>Single amount</b> when the bank uses one Amount column for
                everything. Choose <b>Debit</b> and/or <b>Credit</b> only when spending
                and money in are separate CSV columns. You do not use both layouts.
              </p>
              <p>
                Category columns are optional. Their text is matched to categories
                already in BudgetApp; importing does not create new categories.
              </p>
            </div>
            <div className="import-profile-column-list">
              {columns.map((column, index) => (
                <div className="import-profile-column-row" key={column.key}>
                  <span className="import-profile-column-number">{index + 1}</span>
                  <label>
                    <span>CSV header</span>
                    <input value={column.header} maxLength={100}
                      placeholder="Column name from the CSV"
                      onChange={event => updateColumnHeader(column.key, event.target.value)} />
                  </label>
                  <label>
                    <span>Maps to</span>
                    <select value={column.field}
                      onChange={event => updateColumnField(
                        column.key, event.target.value as ImportColumnField)}>
                      <option value="ignore">Ignore — do not import</option>
                      <option value="date">Transaction date — when it happened</option>
                      <option value="description">Description — merchant or transaction label</option>
                      <option value="amount">Single amount — one signed amount column</option>
                      <option value="debit">Debit — separate spending column</option>
                      <option value="credit">Credit — separate money-in column</option>
                      <option value="category">Category — optional existing category</option>
                      <option value="subcategory">Subcategory — optional existing subcategory</option>
                    </select>
                    <small>{mappingDescriptions[column.field]}</small>
                  </label>
                  <div className="import-profile-column-actions">
                    <button className="icon-button" type="button"
                      aria-label={`Move ${column.header || 'column'} up`}
                      disabled={index === 0}
                      onClick={() => moveColumn(index, -1)}>↑</button>
                    <button className="icon-button" type="button"
                      aria-label={`Move ${column.header || 'column'} down`}
                      disabled={index === columns.length - 1}
                      onClick={() => moveColumn(index, 1)}>↓</button>
                    <button className="text-button" type="button"
                      onClick={() => removeColumn(column.key)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {usesAmount && (
            <label className="import-profile-signs"><span>In the single amount column, what does a positive number mean?</span>
              <select value={form.amountConvention}
                onChange={event => setField(
                  'amountConvention', event.target.value as AmountConvention)}>
                <option value="SpendingPositive">Positive = spending; negative = money in</option>
                <option value="MoneyInPositive">Positive = money in; negative = spending</option>
              </select>
            </label>
          )}
          <p className="field-help import-profile-requirements">
            Required mappings: transaction date, description, and either a single amount
            or at least one debit/credit column.
            {hasDuplicateHeaders && ' Header names must be unique.'}
          </p>
          <button className="primary-button" type="submit" disabled={isBusy || !canSubmit}>
            {isBusy ? 'Saving...' : editingId ? 'Save profile' : 'Create profile'}
          </button>
        </form>}
        <div className="import-profile-sections">
          <section className="account-section import-profile-section import-profile-section-active">
            <div className="account-section-heading">
              <div>
                <h2>Active profiles</h2>
                <p>Available for automatic matching and CSV imports.</p>
              </div>
              <span>{activeProfiles.length}</span>
            </div>
            <div className="account-list">
              {activeProfiles.map(renderProfile)}
              {activeProfiles.length === 0 && (
                <p className="empty-state">No active import profiles.</p>
              )}
            </div>
          </section>
          <section className="account-section import-profile-section import-profile-section-inactive">
            <div className="account-section-heading">
              <div>
                <h2>Inactive profiles</h2>
                <p>Not used for matching. Reactivate or permanently delete them.</p>
              </div>
              <span>{inactiveProfiles.length}</span>
            </div>
            <div className="account-list">
              {inactiveProfiles.map(renderProfile)}
              {inactiveProfiles.length === 0 && (
                <p className="empty-state">No inactive import profiles.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
