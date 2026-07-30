import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createAccount,
  getAccounts,
  setAccountActive,
  updateAccount,
  type AccountItem,
  type AccountScope,
  type AccountType,
  type UpdateAccountRequest,
} from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { currencies } from '../finance/currencies'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'

const accountTypes: AccountType[] = [
  'Chequing',
  'Savings',
  'CreditCard',
  'Cash',
  'Other',
]

const accountTypeLabels: Record<AccountType, string> = {
  Chequing: 'Chequing',
  Savings: 'Savings',
  CreditCard: 'Credit card',
  Cash: 'Cash',
  Other: 'Other',
}

export function AccountManagementPage() {
  const { currentHousehold } = useHouseholds()
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<UpdateAccountRequest | null>(null)

  const canManageHouseholdAccounts = currentHousehold?.role !== 'Viewer'
  const currencyOptions = currencies.includes(currentHousehold?.defaultCurrency ?? '')
    ? currencies
    : [currentHousehold?.defaultCurrency ?? 'CAD', ...currencies]

  const loadAccounts = useCallback(async () => {
    if (!currentHousehold) {
      return
    }

    setIsLoading(true)
    setErrors([])
    try {
      setAccounts(await getAccounts(currentHousehold.id))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsLoading(false)
    }
  }, [currentHousehold])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const visibleAccounts = useMemo(
    () => accounts.filter(account => showArchived || account.isActive),
    [accounts, showArchived],
  )

  if (!currentHousehold) {
    return null
  }

  const performChange = async (change: () => Promise<unknown>): Promise<boolean> => {
    setIsSaving(true)
    setErrors([])
    try {
      await change()
      await loadAccounts()
      return true
    } catch (error) {
      setErrors(getErrorMessages(error))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const succeeded = await performChange(() => createAccount(currentHousehold.id, {
      name: String(data.get('name') ?? ''),
      type: String(data.get('type') ?? 'Chequing') as AccountType,
      scope: String(data.get('scope') ?? 'Personal') as AccountScope,
      currency: String(data.get('currency') ?? currentHousehold.defaultCurrency),
      institutionName: String(data.get('institutionName') ?? ''),
      lastFourDigits: String(data.get('lastFourDigits') ?? ''),
    }))

    if (succeeded) {
      form.reset()
    }
  }

  const beginEdit = (account: AccountItem) => {
    setEditingId(account.id)
    setEditDraft({
      name: account.name,
      type: account.type,
      scope: account.scope,
      currency: account.currency,
      institutionName: account.institutionName ?? '',
      lastFourDigits: account.lastFourDigits ?? '',
    })
  }

  const handleUpdate = async (accountId: string) => {
    if (!editDraft) {
      return
    }

    const succeeded = await performChange(() => updateAccount(
      currentHousehold.id,
      accountId,
      editDraft,
    ))
    if (succeeded) {
      setEditingId(null)
      setEditDraft(null)
    }
  }

  const canChange = (account: AccountItem) =>
    account.scope === 'Personal' || canManageHouseholdAccounts

  const renderAccount = (account: AccountItem) => {
    const details = [
      account.institutionName,
      account.lastFourDigits ? `•••• ${account.lastFourDigits}` : null,
    ].filter(Boolean).join(' · ')

    return (
      <article
        className={`account-card${account.isActive ? '' : ' archived-account'}`}
        key={account.id}
      >
        {editingId === account.id && editDraft ? (
          <div className="account-edit-form">
            <div className="account-edit-grid">
              <label>
                <span>Account name</span>
                <input
                  value={editDraft.name}
                  maxLength={100}
                  onChange={event => setEditDraft({
                    ...editDraft,
                    name: event.target.value,
                  })}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={editDraft.type}
                  onChange={event => setEditDraft({
                    ...editDraft,
                    type: event.target.value as AccountType,
                  })}
                >
                  {accountTypes.map(type => (
                    <option key={type} value={type}>{accountTypeLabels[type]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Institution</span>
                <input
                  value={editDraft.institutionName ?? ''}
                  maxLength={100}
                  onChange={event => setEditDraft({
                    ...editDraft,
                    institutionName: event.target.value,
                  })}
                />
              </label>
              <label>
                <span>Scope</span>
                <select
                  value={editDraft.scope}
                  onChange={event => setEditDraft({
                    ...editDraft,
                    scope: event.target.value as AccountScope,
                  })}
                >
                  {canManageHouseholdAccounts && (
                    <option value="Household">Household/shared</option>
                  )}
                  <option value="Personal">Personal/mine</option>
                </select>
              </label>
              <label>
                <span>Currency</span>
                <select
                  value={editDraft.currency}
                  onChange={event => setEditDraft({
                    ...editDraft,
                    currency: event.target.value,
                  })}
                >
                  {currencyOptions.map(currency => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Last four digits</span>
                <input
                  value={editDraft.lastFourDigits ?? ''}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  onChange={event => setEditDraft({
                    ...editDraft,
                    lastFourDigits: event.target.value,
                  })}
                />
              </label>
            </div>
            <p className="field-help">
              Changing scope also changes who can see this account. Reports will keep currencies separate.
            </p>
            <div className="account-actions">
              <button
                type="button"
                disabled={isSaving || !editDraft.name.trim()}
                onClick={() => void handleUpdate(account.id)}
              >Save changes</button>
              <button
                className="text-button"
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setEditingId(null)
                  setEditDraft(null)
                }}
              >Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="account-card-main">
              <span className="account-type-mark" aria-hidden="true">
                {account.type === 'CreditCard' ? 'CC' : account.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <div className="account-name-line">
                  <h3>{account.name}</h3>
                  {!account.isActive && <span className="status-pill">Archived</span>}
                </div>
                <p>{accountTypeLabels[account.type]} · {account.currency}</p>
                {details && <small>{details}</small>}
              </div>
            </div>
            {canChange(account) && (
              <div className="account-actions">
                <button
                  className="text-button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => beginEdit(account)}
                >Edit</button>
                <button
                  className="text-button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void performChange(() => setAccountActive(
                    currentHousehold.id,
                    account.id,
                    !account.isActive,
                  ))}
                >{account.isActive ? 'Archive' : 'Reactivate'}</button>
              </div>
            )}
          </>
        )}
      </article>
    )
  }

  return (
    <main className="management-page">
      <header className="app-header">
        <BrandLockup />
        <AppLink className="header-link" to="/dashboard">Return to dashboard</AppLink>
      </header>

      <section className="management-content">
        <div className="page-title-row" data-tutorial-id="accounts-page-title">
          <div>
            <p className="eyebrow">Household</p>
            <h1>Accounts</h1>
            <p>Manage shared accounts and your personal accounts in {currentHousehold.name}.</p>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={event => setShowArchived(event.target.checked)}
            />
            <span>Show archived</span>
          </label>
        </div>

        <ErrorSummary errors={errors} />

        <form className="add-account-form" onSubmit={(event) => void handleCreate(event)}>
          <div className="account-form-heading">
            <div>
              <h2>Add account</h2>
              <p>Balances and bank credentials are not stored here.</p>
            </div>
            <span className="currency-pill">Default {currentHousehold.defaultCurrency}</span>
          </div>
          <div className="account-form-grid">
            <label>
              <span>Account name</span>
              <input name="name" maxLength={100} required placeholder="Everyday Chequing" />
            </label>
            <label>
              <span>Type</span>
              <select name="type" defaultValue="Chequing">
                {accountTypes.map(type => (
                  <option key={type} value={type}>{accountTypeLabels[type]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Scope</span>
              <select
                name="scope"
                defaultValue={canManageHouseholdAccounts ? 'Household' : 'Personal'}
              >
                {canManageHouseholdAccounts && <option value="Household">Household/shared</option>}
                <option value="Personal">Personal/mine</option>
              </select>
            </label>
            <label>
              <span>Institution (optional)</span>
              <input name="institutionName" maxLength={100} placeholder="Bank or credit union" />
            </label>
            <label>
              <span>Currency</span>
              <select name="currency" defaultValue={currentHousehold.defaultCurrency}>
                {currencyOptions.map(currency => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Last four digits (optional)</span>
              <input
                name="lastFourDigits"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="1234"
              />
            </label>
          </div>
          <button className="primary-button account-submit" type="submit" disabled={isSaving}>
            Add account
          </button>
        </form>

        {isLoading ? (
          <p className="empty-state">Loading accounts...</p>
        ) : visibleAccounts.length === 0 ? (
          <div className="empty-state">
            <h2>No accounts to show</h2>
            <p>Add your first account or show archived accounts.</p>
          </div>
        ) : (
          <div className="account-sections">
            {(['Household', 'Personal'] as AccountScope[]).map(scope => {
              const scopedAccounts = visibleAccounts.filter(account => account.scope === scope)
              if (scopedAccounts.length === 0) {
                return null
              }

              return (
                <section className="account-section" key={scope}>
                  <div className="account-section-heading">
                    <div>
                      <h2>{scope === 'Household' ? 'Household accounts' : 'My personal accounts'}</h2>
                      <p>{scope === 'Household'
                        ? 'Shared financial activity for this household.'
                        : 'Visible only in your personal account list.'}</p>
                    </div>
                    <span>{scopedAccounts.length}</span>
                  </div>
                  <div className="account-list">
                    {scopedAccounts.map(renderAccount)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
