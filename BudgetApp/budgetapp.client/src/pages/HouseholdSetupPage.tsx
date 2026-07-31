import { useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { BrandMark } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { HouseholdForm } from '../households/HouseholdForm'
import type { CreateHouseholdRequest } from '../households/householdApi'
import { useHouseholds } from '../households/useHouseholds'
import { useRouter } from '../routing/useRouter'

export function HouseholdSetupPage() {
  const { user, logout } = useAuth()
  const { createHousehold } = useHouseholds()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (request: CreateHouseholdRequest) => {
    setIsSubmitting(true)
    setErrors([])

    try {
      await createHousehold(request)
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
            <BrandMark />
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

        <HouseholdForm
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        />
      </section>
    </main>
  )
}
