import { useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { ErrorSummary } from '../components/ErrorSummary'
import { HouseholdForm } from '../households/HouseholdForm'
import type { CreateHouseholdRequest } from '../households/householdApi'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function HouseholdCreatePage() {
  const { createHousehold } = useHouseholds()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (request: CreateHouseholdRequest) => {
    setIsSubmitting(true)
    setErrors([])

    try {
      await createHousehold(request)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
      setIsSubmitting(false)
    }
  }

  return (
    <main className="management-page">
      <div className="management-content narrow-management-content">
        <header className="page-title-row">
          <div>
            <span className="eyebrow">Households</span>
            <h1>Create another household</h1>
            <p>
              This creates a separate financial space with its own members,
              accounts, categories, imports, and budgets.
            </p>
          </div>
          <AppLink className="secondary-link-button" to="/household">
            Cancel
          </AppLink>
        </header>

        <ErrorSummary errors={errors} />

        <section className="household-management-section">
          <HouseholdForm
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
          />
        </section>
      </div>
    </main>
  )
}
