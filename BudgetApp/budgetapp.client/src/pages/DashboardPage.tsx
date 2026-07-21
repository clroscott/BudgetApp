import { useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { useRouter } from '../routing/useRouter'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const { navigate } = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  if (!user) {
    return null
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
    <main className="dashboard-page">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BudgetApp</span>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={isSigningOut}
          onClick={() => void handleLogout()}
        >
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <section className="dashboard-content">
        <p className="eyebrow">Dashboard</p>
        <h1>Hello, {user.displayName}</h1>
        <p className="dashboard-intro">
          You are signed in. Household setup and budgeting tools are coming next.
        </p>

        <ErrorSummary errors={errors} />

        <div className="dashboard-grid">
          <article className="summary-card">
            <span>Account</span>
            <strong>{user.email}</strong>
            <small>User ID: {user.id}</small>
          </article>
          <article className="summary-card muted-card">
            <span>Household</span>
            <strong>Not configured</strong>
            <small>This will be the next onboarding step.</small>
          </article>
        </div>
      </section>
    </main>
  )
}
