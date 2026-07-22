import { useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { useRouter } from '../routing/useRouter'

function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver'
}

function getSupportedValues(
  key: 'currency' | 'timeZone',
  fallback: string[],
): string[] {
  if (typeof Intl.supportedValuesOf !== 'function') {
    return fallback
  }

  return Intl.supportedValuesOf(key)
}

const currencies = getSupportedValues('currency', ['CAD', 'USD'])
const browserTimeZone = getBrowserTimeZone()
const supportedTimeZones = getSupportedValues('timeZone', [browserTimeZone])
const timeZones = supportedTimeZones.includes(browserTimeZone)
  ? supportedTimeZones
  : [browserTimeZone, ...supportedTimeZones]

export function HouseholdSetupPage() {
  const { user, logout } = useAuth()
  const { createInitialHousehold } = useHouseholds()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrors([])

    const form = new FormData(event.currentTarget)

    try {
      await createInitialHousehold({
        name: String(form.get('name') ?? ''),
        defaultCurrency: String(form.get('defaultCurrency') ?? ''),
        timeZoneId: String(form.get('timeZoneId') ?? ''),
      })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setIsSigningOut(true)
    setErrors([])

    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
      setIsSigningOut(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="household-heading">
        <header className="auth-header">
          <div className="setup-header-row">
            <span className="brand-mark" aria-hidden="true">B</span>
            <button
              className="text-button"
              type="button"
              disabled={isSigningOut}
              onClick={() => void handleLogout()}
            >
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
          <p className="eyebrow">Household setup</p>
          <h1 id="household-heading">Welcome, {user?.displayName}</h1>
          <p>Create your household before adding accounts and budgets.</p>
        </header>

        <ErrorSummary errors={errors} />

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="name">Household name</label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="organization"
            maxLength={100}
            placeholder="e.g. Our Household"
            required
          />

          <label htmlFor="defaultCurrency">Default currency</label>
          <select
            id="defaultCurrency"
            name="defaultCurrency"
            defaultValue="CAD"
            aria-describedby="currency-help"
            required
          >
            {currencies.map(currency => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
          <p id="currency-help" className="field-help">
            Budget amounts will use this currency.
          </p>

          <label htmlFor="timeZoneId">Time zone</label>
          <select
            id="timeZoneId"
            name="timeZoneId"
            defaultValue={browserTimeZone}
            aria-describedby="timezone-help"
            required
          >
            {timeZones.map(timeZone => (
              <option key={timeZone} value={timeZone}>{timeZone}</option>
            ))}
          </select>
          <p id="timezone-help" className="field-help">
            This controls monthly boundaries and future forecasts.
          </p>

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating household...' : 'Create household'}
          </button>
        </form>
      </section>
    </main>
  )
}
