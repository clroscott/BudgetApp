import type { FormEvent } from 'react'
import { currencies } from '../finance/currencies'
import type { CreateHouseholdRequest } from './householdApi'
import { useUnsavedNativeForm } from '../routing/useUnsavedForm'
import { timeZoneOptions } from './timeZoneOptions'

function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver'
}

const browserTimeZone = getBrowserTimeZone()
const timeZones = timeZoneOptions(browserTimeZone)

export function HouseholdForm({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean
  onSubmit: (request: CreateHouseholdRequest) => Promise<void>
}) {
  const guard = useUnsavedNativeForm('Discard the new household details you entered?')
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await onSubmit({
      name: String(form.get('name') ?? ''),
      defaultCurrency: String(form.get('defaultCurrency') ?? ''),
      timeZoneId: String(form.get('timeZoneId') ?? ''),
    })
  }

  return (
    <form
      {...guard.formProps}
      className="household-create-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label htmlFor="household-name">Household name</label>
      <input
        id="household-name"
        name="name"
        type="text"
        autoComplete="organization"
        maxLength={100}
        placeholder="e.g. Our Household"
        required
      />

      <label htmlFor="household-default-currency">Default currency</label>
      <select
        id="household-default-currency"
        name="defaultCurrency"
        defaultValue="CAD"
        aria-describedby="household-currency-help"
        required
      >
        {currencies.map(currency => (
          <option key={currency} value={currency}>{currency}</option>
        ))}
      </select>
      <p id="household-currency-help" className="field-help">
        Budget amounts created in this household will use this currency.
      </p>

      <label htmlFor="household-time-zone">Time zone</label>
      <select
        id="household-time-zone"
        name="timeZoneId"
        defaultValue={browserTimeZone}
        aria-describedby="household-timezone-help"
        required
      >
        {timeZones.map(timeZone => (
          <option key={timeZone} value={timeZone}>{timeZone}</option>
        ))}
      </select>
      <p id="household-timezone-help" className="field-help">
        Stores the household's preferred time zone. It does not change transaction dates.
      </p>

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating household...' : 'Create household'}
      </button>
    </form>
  )
}
