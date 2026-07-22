import { useState } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { useHouseholds } from '../households/useHouseholds'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const { currentHousehold } = useHouseholds()
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
          Your household foundation is ready. Manage accounts and categories before importing transactions.
        </p>

        <ErrorSummary errors={errors} />

        <div className="dashboard-grid">
          <article className="summary-card">
            <span>Profile</span>
            <strong>{user.email}</strong>
            <small>User ID: {user.id}</small>
          </article>
          <article className="summary-card">
            <span>Accounts</span>
            <strong>Financial accounts</strong>
            <small>Set up shared and personal transaction sources.</small>
            <AppLink to="/accounts">Manage accounts</AppLink>
          </article>
          <article className="summary-card">
            <span>Categories</span>
            <strong>Household categories</strong>
            <small>Organize transactions and future budget lines.</small>
            <AppLink to="/settings/categories">Manage categories</AppLink>
          </article>
          <article className="summary-card">
            <span>Budgeting</span>
            <strong>Monthly budget</strong>
            <small>Plan household or personal spending by category.</small>
            <AppLink to="/budgeting">Manage budget</AppLink>
            <AppLink to="/budgeting/recurring-expenses">Manage recurring expenses</AppLink>
          </article>
          <article className="summary-card">
            <span>Transactions</span>
            <strong>Official activity</strong>
            <small>Review and correct approved household and personal transactions.</small>
            <AppLink to="/transactions">View transactions</AppLink>
          </article>
          <article className="summary-card">
            <span>Import</span>
            <strong>CSV transactions</strong>
            <small>Stage bank transactions for validation and review.</small>
            <AppLink to="/import">Import a CSV</AppLink>
            <AppLink to="/imports/review">Review imports</AppLink>
          </article>
          <article className="summary-card">
            <span>Household</span>
            <strong>{currentHousehold?.name}</strong>
            <small>
              {currentHousehold?.defaultCurrency} / {currentHousehold?.role}
            </small>
          </article>
        </div>
      </section>
    </main>
  )
}
