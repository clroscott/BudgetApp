import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/apiClient'
import { getErrorMessages } from '../auth/errorMessages'
import { ErrorSummary } from '../components/ErrorSummary'
import { HouseholdSectionNav } from '../components/HouseholdSectionNav'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { currencies } from '../finance/currencies'
import { getHouseholdSettings, saveHouseholdSettings, type HouseholdSettings, type HouseholdSettingsValues } from '../households/householdApi'
import { timeZoneOptions } from '../households/timeZoneOptions'
import { useHouseholds } from '../households/useHouseholds'
import { ContextualHelp } from '../components/ContextualHelp'
import { AppLink } from '../routing/AppLink'
import { useUnsavedForm } from '../routing/useUnsavedForm'
import { usePageLoad } from './usePageLoad'

const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2020, index, 1)))
const empty: HouseholdSettingsValues = { name: '', defaultCurrency: 'CAD', timeZoneId: 'UTC', fiscalYearStartMonth: 1 }
const values = (data: HouseholdSettings): HouseholdSettingsValues => ({ name: data.name, defaultCurrency: data.defaultCurrency,
  timeZoneId: data.timeZoneId, fiscalYearStartMonth: data.fiscalYearStartMonth })

export function HouseholdSettingsPage() {
  const { currentHousehold, updateHousehold } = useHouseholds()
  const householdId = currentHousehold?.id
  const id = useId()
  const [saved, setSaved] = useState<HouseholdSettings | null>(null)
  const [draft, setDraft] = useState<HouseholdSettingsValues>(empty)
  const [isSaving, setIsSaving] = useState(false)
  const pendingWrite = useRef(false)
  const [requiresReload, setRequiresReload] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const guard = useUnsavedForm(draft, 'Discard your unsaved household settings?')
  const { markClean } = guard
  const loadState = usePageLoad(householdId ?? '')
  const { run, markReady } = loadState
  const apply = useCallback((data: HouseholdSettings) => {
    setSaved(data)
    const next = values(data)
    setDraft(next)
    markClean(next)
    setRequiresReload(false)
  }, [markClean])
  const load = useCallback(async () => {
    if (!householdId) return
    setErrors([])
    await run(() => getHouseholdSettings(householdId), apply)
  }, [householdId, run, apply])
  useEffect(() => { void load() }, [load])

  const canEdit = loadState.isFresh && saved?.canEdit && !isSaving && !requiresReload
  const reload = () => {
    if (pendingWrite.current || !guard.confirmDiscard()) return
    setNotice(null)
    void load()
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!householdId || !currentHousehold || !saved || !canEdit || !guard.isDirty || pendingWrite.current) return
    pendingWrite.current = true
    setIsSaving(true)
    setErrors([])
    setNotice(null)
    try {
      const data = await saveHouseholdSettings(householdId, { ...draft, version: saved.version })
      apply(data)
      markReady()
      updateHousehold({ ...currentHousehold, name: data.name, defaultCurrency: data.defaultCurrency, timeZoneId: data.timeZoneId })
      setNotice('Household settings were saved. Existing budgets and transactions were not changed.')
    } catch (error) {
      setErrors(getErrorMessages(error))
      if (error instanceof ApiError && [401, 403, 409].includes(error.status)) setRequiresReload(true)
    } finally {
      pendingWrite.current = false
      setIsSaving(false)
    }
  }
  const cancel = () => {
    if (!saved || pendingWrite.current || !guard.confirmDiscard()) return
    setDraft(values(saved))
    markClean(values(saved))
    setErrors([])
    setNotice(null)
  }

  return <main className="management-page">
    <section className="management-content narrow-management-content">
      {currentHousehold && <HouseholdSectionNav current="settings" />}
      <header className="page-title-row">
        <div><p className="eyebrow">Household</p><h1>Household settings</h1>
          <p>{currentHousehold ? `Shared settings for ${currentHousehold.name}.` : 'No household is selected.'}</p></div>
        <AppLink className="header-link" to="/dashboard">Return to dashboard</AppLink>
      </header>
      {currentHousehold ? <>
        <PageLoadFeedback subject="household settings" status={loadState.status} errors={loadState.errors}
          disabled={isSaving} onReload={reload} />
        <ErrorSummary errors={errors} />
        {notice && <p className="success-summary" role="status">{notice}</p>}
        {isSaving && <p role="status">Saving household settings…</p>}
        {requiresReload && <p className="field-help">Your entered values are kept. Reload the current settings before saving again; reloading asks before discarding edits.</p>}
        {loadState.hasData && saved && <form className="household-settings-form" onSubmit={event => void save(event)}>
          <p>{saved.canEdit ? 'Owners and Admins can edit these shared settings.' : 'Only Owners and Admins can edit these settings. You have read-only access.'}</p>
          <label htmlFor={`${id}-name`}>Household name</label>
          <input id={`${id}-name`} required maxLength={100} autoComplete="organization" value={draft.name}
            disabled={!canEdit} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
          <label htmlFor={`${id}-zone`}>Time zone</label>
          <select id={`${id}-zone`} aria-describedby={`${id}-zone-help`} value={draft.timeZoneId} disabled={!canEdit}
            onChange={event => setDraft(current => ({ ...current, timeZoneId: event.target.value }))}>
            {timeZoneOptions(saved.timeZoneId).map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          <p id={`${id}-zone-help`} className="field-help">Stores the household's preferred time zone. Existing transaction dates and budget periods are not changed.</p>
          <label htmlFor={`${id}-fiscal`}>Default fiscal-year starting month</label>
          <select id={`${id}-fiscal`} aria-describedby={`${id}-fiscal-help`} value={draft.fiscalYearStartMonth} disabled={!canEdit}
            onChange={event => setDraft(current => ({ ...current, fiscalYearStartMonth: Number(event.target.value) }))}>
            {months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
          </select>
          <p id={`${id}-fiscal-help`} className="field-help">Chooses the initial month for new, unsaved annual plans. You can still choose a different start for each plan. This default does not change saved annual plans or existing monthly budgets.</p>
          <ContextualHelp topic="annual-targets" />
          <label htmlFor={`${id}-currency`}>Default currency</label>
          <select id={`${id}-currency`} aria-describedby={`${id}-currency-help`} value={draft.defaultCurrency}
            disabled={!canEdit || !saved.canChangeCurrency} onChange={event => setDraft(current => ({ ...current, defaultCurrency: event.target.value }))}>
            {[...new Set([saved.defaultCurrency, ...currencies])].map(currency => <option key={currency} value={currency}>{currency}</option>)}
          </select>
          <p id={`${id}-currency-help`} className="field-help">{saved.currencyLockedReason ?? 'Can be changed only before financial accounts, imports, budgets, annual plans, transactions, or recurring expenses exist. This does not convert any amounts.'}</p>
          {saved.canEdit && <div className="household-settings-actions">
            <button className="primary-button" type="submit" disabled={!canEdit || !guard.isDirty}>{isSaving ? 'Saving…' : 'Save settings'}</button>
            <button className="secondary-button" type="button" disabled={isSaving || !guard.isDirty} onClick={cancel}>Cancel changes</button>
          </div>}
        </form>}
      </> : <p className="empty-state">Choose or create a household before opening its settings.</p>}
    </section>
  </main>
}
