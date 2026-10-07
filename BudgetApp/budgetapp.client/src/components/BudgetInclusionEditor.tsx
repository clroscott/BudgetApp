import { useEffect, useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useUnsavedForm } from '../routing/useUnsavedForm'
import { updateBudgetInclusion, type TransactionItem } from '../transactions/transactionApi'
import { ErrorSummary } from './ErrorSummary'
import { ContextualHelp } from './ContextualHelp'
import { helpWarnings } from '../help/helpTopics'

export function BudgetInclusionEditor({ householdId, transaction, onSaved, disabled = false }: {
  householdId: string, transaction: TransactionItem, onSaved: () => Promise<void>,
  disabled?: boolean,
}) {
  const [value, setValue] = useState({
    household: transaction.includeInHouseholdBudget ?? false,
    personal: transaction.includeInPersonalBudget ?? false,
  })
  const { isDirty, markClean, confirmDiscard } = useUnsavedForm(value, 'Discard your unsaved budget inclusion changes?')
  const [version, setVersion] = useState(transaction.updatedAtUtc)
  useEffect(() => {
    if (isDirty || version === transaction.updatedAtUtc) return
    const next = { household: transaction.includeInHouseholdBudget ?? false, personal: transaction.includeInPersonalBudget ?? false }
    setValue(next)
    markClean(next)
    setVersion(transaction.updatedAtUtc)
  }, [isDirty, markClean, version, transaction.updatedAtUtc,
    transaction.includeInHouseholdBudget, transaction.includeInPersonalBudget])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const save = async () => {
    if (!version) return
    setSaving(true)
    setErrors([])
    try {
      await updateBudgetInclusion(householdId, transaction.id, {
        includeInHouseholdBudget: transaction.canEditHouseholdInclusion ? value.household : undefined,
        includeInPersonalBudget: value.personal, updatedAtUtc: version,
      })
      markClean(value)
      setNotice('Budget inclusion saved.')
      try { await onSaved() }
      catch { setErrors(['Saved, but the list could not be refreshed. Reload before making another change.']) }
    } catch (error) { setErrors(getErrorMessages(error)) }
    finally { setSaving(false) }
  }
  return <details className="transaction-inline-edit">
    <summary>Include in budgets</summary>
    {disabled && <p>Save or cancel the transaction edit before changing budget inclusion.</p>}
    <fieldset className="budget-inclusion-controls" disabled={saving || disabled}>
      <legend>{transaction.description}</legend>
      <label className="checkbox-row"><input type="checkbox" checked={value.personal}
        onChange={event => setValue({ ...value, personal: event.target.checked })} />My personal budget</label>
      <label className="checkbox-row"><input type="checkbox" checked={value.household}
        disabled={!transaction.canEditHouseholdInclusion}
        onChange={event => setValue({ ...value, household: event.target.checked })} />Household budget</label>
      <p>The full amount counts toward each selected budget. The transaction is recorded only once.</p>
      {transaction.canEditHouseholdInclusion && <p>{helpWarnings.sharePersonalExpense}</p>}
      <ContextualHelp topic="scope-privacy" />
      {transaction.canEditHouseholdInclusion && transaction.includeInHouseholdBudget && !value.household &&
        <p>For a personal-account transaction, removing Household inclusion also hides it from other
          members and removes it from their Personal actuals.</p>}
      <button className="primary-button" type="button" disabled={!isDirty || !version}
        onClick={() => void save()}>{saving ? 'Saving...' : 'Save budget inclusion'}</button>
      <button className="text-button" type="button" onClick={() => {
        if (!confirmDiscard()) return
        const original = { household: transaction.includeInHouseholdBudget ?? false, personal: transaction.includeInPersonalBudget ?? false }
        setValue(original); markClean(original); setVersion(transaction.updatedAtUtc); setErrors([]); setNotice('')
      }}>Reset</button>
      {errors.length > 0 && <button className="text-button" type="button" onClick={async () => {
        if (!confirmDiscard()) return
        setSaving(true)
        try { await onSaved(); markClean(value); setErrors([]); setNotice('Reloaded. Check the choices before saving.') }
        catch (error) { setErrors(getErrorMessages(error)) }
        finally { setSaving(false) }
      }}>Reload saved choices</button>}
    </fieldset>
    <ErrorSummary errors={errors} />{notice && <p role="status">{notice}</p>}
  </details>
}
