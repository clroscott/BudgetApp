import { PageFrame } from '../components/PageFrame'
import { useCallback, useContext, useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { ErrorSummary } from '../components/ErrorSummary'
import { currencies } from '../finance/currencies'
import { useHouseholds } from '../households/useHouseholds'
import { ContextualHelp } from '../components/ContextualHelp'
import { useUnsavedForm, useUnsavedNativeForm } from '../routing/useUnsavedForm'
import { ApiError } from '../api/apiClient'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useSetupTutorialPage } from '../tutorials/setupTutorialState'
import { TutorialContext } from '../tutorials/tutorialContext'

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
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<UpdateAccountRequest | null>(null)
  const editGuard = useUnsavedForm(editDraft, 'Discard your unsaved account changes?')
  const createGuard = useUnsavedNativeForm('Discard the new account details you entered?')
  const setupTask = useContext(TutorialContext)?.setupGuide
  const [guideSelection, setGuideSelection] = useState<string | null>(() => setupTask?.selection ?? null)
  const [createdId, setCreatedId] = useState<string | null>(() => setupTask?.accountId ?? null)
  const [uncertain, setUncertain] = useState(false)
  const [needsRead, setNeedsRead] = useState(false)
  const loadState = usePageLoad(`${currentHousehold?.id}/${currentHousehold?.role}`)
  const { run, captureContext } = loadState
  const selectedAccount = accounts.find(account => account.isActive && account.id === (guideSelection === 'new' ? createdId : guideSelection))
  const tutorialActive = useSetupTutorialPage(currentHousehold ? {
    page: 'accounts', householdId: currentHousehold.id, fresh: loadState.isFresh && !needsRead, busy: isSaving || loadState.isPending,
    dirty: createGuard.isDirty || editGuard.isDirty || editingId !== null, uncertain,
    selection: guideSelection, accountId: selectedAccount?.id ?? null,
  } : null)

  const canManageHouseholdAccounts = currentHousehold?.role !== 'Viewer'
  const currencyOptions = currencies.includes(currentHousehold?.defaultCurrency ?? '')
    ? currencies
    : [currentHousehold?.defaultCurrency ?? 'CAD', ...currencies]

  const loadAccounts = useCallback(async () => {
    if (!currentHousehold) {
      return false
    }

    return run(() => getAccounts(currentHousehold.id), items => { setAccounts(items); setNeedsRead(false) })
  }, [currentHousehold, run])

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

  const performChange = async <T,>(change: () => Promise<T>, confirmed?: (result: T) => void): Promise<boolean> => {
    if (isSaving || uncertain || !loadState.isFresh) return false
    const isCurrent = captureContext()
    setIsSaving(true)
    setErrors([])
    try {
      const result = await change()
      if (!isCurrent()) return false
      confirmed?.(result)
      return await loadAccounts()
    } catch (error) {
      if (!isCurrent()) return false
      setErrors(getErrorMessages(error))
      if (tutorialActive && !(error instanceof ApiError && [400, 422].includes(error.status))) { setUncertain(true); setNeedsRead(true) }
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (tutorialActive && guideSelection === 'new' && createdId) return
    const form = event.currentTarget
    const data = new FormData(form)
    await performChange(() => createAccount(currentHousehold.id, {
      name: String(data.get('name') ?? ''),
      type: String(data.get('type') ?? 'Chequing') as AccountType,
      scope: String(data.get('scope') ?? 'Personal') as AccountScope,
      currency: String(data.get('currency') ?? currentHousehold.defaultCurrency),
      institutionName: String(data.get('institutionName') ?? ''),
      lastFourDigits: String(data.get('lastFourDigits') ?? ''),
    }), result => {
      setCreatedId(result.id)
      form.reset()
      createGuard.markClean()
    })
  }

  const beginEdit = (account: AccountItem) => {
    if (editingId === account.id || !editGuard.confirmDiscard()) return
    setEditingId(account.id)
    const next: UpdateAccountRequest = {
      name: account.name,
      type: account.type,
      scope: account.scope,
      currency: account.currency,
      institutionName: account.institutionName ?? '',
      lastFourDigits: account.lastFourDigits ?? '',
    }
    setEditDraft(next)
    editGuard.markClean(next)
  }

  const handleUpdate = async (accountId: string) => {
    if (!editDraft) {
      return
    }

    await performChange(() => updateAccount(
      currentHousehold.id,
      accountId,
      editDraft,
    ), () => {
      setEditingId(null)
      setEditDraft(null)
      editGuard.markClean(null)
    })
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
        data-tutorial-id={selectedAccount?.id === account.id ? 'setup-tour-account-selected' : undefined}
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
              Changing scope also changes who can see this account. Saved transaction budget inclusion
              does not change automatically. Reports keep currencies separate.
            </p>
            <ContextualHelp topic="scope-privacy" />
            <div className="account-actions" data-tutorial-id={selectedAccount?.id === account.id ? 'setup-tour-account-save' : undefined}>
              <button
                type="button"
                disabled={isSaving || uncertain || !loadState.isFresh || !editDraft.name.trim()}
                onClick={() => void handleUpdate(account.id)}
              >Save changes</button>
              <button
                className="text-button"
                type="button"
                disabled={isSaving}
                onClick={() => {
                  if (!editGuard.confirmDiscard()) return
                  setEditingId(null)
                  setEditDraft(null)
                  editGuard.markClean(null)
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
                  disabled={isSaving || uncertain || !loadState.isFresh}
                  onClick={() => beginEdit(account)}
                >Edit</button>
                <button
                  className="text-button"
                  type="button"
                  disabled={isSaving || uncertain || !loadState.isFresh}
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
    <PageFrame footer={<div id="setup-tutorial-guide-host" />}>
        <div className="page-title-row" data-tutorial-id="accounts-page-title">
          <div>
            <p className="eyebrow">Household</p>
            <h1>Financial accounts</h1>
            <p>Manage shared accounts and your personal accounts in {currentHousehold.name}.</p>
            <p>Account scope controls account privacy. “Include in budgets” on a transaction
              controls which budgets count it, without sharing the whole account.</p>
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

        {!uncertain && <ErrorSummary errors={errors} />}
        <PageLoadFeedback subject="accounts" status={loadState.status} errors={loadState.errors} onReload={() => void loadAccounts()} disabled={isSaving} />
        {uncertain && <div className="error-summary" role="alert"><p>The account request may have saved. Check the list before another change.</p>
          <button type="button" disabled={isSaving || loadState.isPending} onClick={() => { setErrors([]); void loadAccounts() }}>Check saved accounts</button>
          <p>Choose the actual saved account below rather than adding it again.</p></div>}
        {tutorialActive && <section className="add-account-form" data-tutorial-id="setup-tour-account-choice">
          <label><span>Account for this tutorial</span><select value={guideSelection ?? ''} disabled={!loadState.isFresh || isSaving || needsRead} onChange={event => {
            const id = event.target.value
            if (needsRead) return
            if (!id || uncertain && id === 'new' || !createGuard.confirmDiscard() || !editGuard.confirmDiscard()) return
            setGuideSelection(id); setCreatedId(null); setUncertain(false); setErrors([])
            const form = document.getElementById('setup-account-create') as HTMLFormElement | null
            form?.reset(); createGuard.markClean(); setEditingId(null); setEditDraft(null); editGuard.markClean(null)
          }}><option value="">Choose an account…</option><option value="new" disabled={uncertain}>{createdId ? 'Use the account just saved' : 'New account'}</option>
            {accounts.filter(account => account.isActive).map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency} · {account.scope}</option>)}
          </select></label>
        </section>}

        {loadState.hasData && <form {...createGuard.formProps} id="setup-account-create" data-tutorial-id={guideSelection === 'new' && !createdId ? 'setup-tour-account-form' : undefined} className="add-account-form" onSubmit={(event) => void handleCreate(event)}>
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
          <button className="primary-button account-submit" data-tutorial-id={guideSelection === 'new' && !createdId ? 'setup-tour-account-save' : undefined} type="submit" disabled={isSaving || uncertain || !loadState.isFresh || Boolean(tutorialActive && guideSelection === 'new' && createdId)}>
            Add account
          </button>
          <ContextualHelp topic="scope-privacy" />
        </form>}

        {loadState.hasData && (visibleAccounts.length === 0 ? (
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
        ))}
    </PageFrame>
  )
}
