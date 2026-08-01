import type { FormEvent } from 'react'
import { currencies } from '../finance/currencies'
import type { CreateHouseholdRequest } from './householdApi'

function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver'
}

function getSupportedTimeZones(fallback: string[]): string[] {
  if (typeof Intl.supportedValuesOf !== 'function') {
    return fallback
  }

  return Intl.supportedValuesOf('timeZone')
}

const browserTimeZone = getBrowserTimeZone()
const supportedTimeZones = getSupportedTimeZones([browserTimeZone])
const timeZones = supportedTimeZones.includes(browserTimeZone)
  ? supportedTimeZones
  : [browserTimeZone, ...supportedTimeZones]

export function HouseholdForm({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean
  onSubmit: (request: CreateHouseholdRequest) => Promise<void>
}) {
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
        This controls monthly boundaries and future forecasts.
      </p>

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating household...' : 'Create household'}
      </button>
    </form>
  )
}
