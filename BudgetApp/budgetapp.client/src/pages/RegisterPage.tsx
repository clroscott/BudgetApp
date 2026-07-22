import { useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function RegisterPage() {
  const { register } = useAuth()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrors([])

    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    const confirmPassword = String(form.get('confirmPassword') ?? '')

    if (password !== confirmPassword) {
      setErrors(['Passwords do not match.'])
      setIsSubmitting(false)
      return
    }

    try {
      await register({
        displayName: String(form.get('displayName') ?? ''),
        email: String(form.get('email') ?? ''),
        password,
      })
      navigate('/household/setup', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-heading">
        <header className="auth-header">
          <span className="brand-mark" aria-hidden="true">B</span>
          <p className="eyebrow">BudgetApp</p>
          <h1 id="register-heading">Create your account</h1>
          <p>Start with your account. Household setup comes next.</p>
        </header>

        <ErrorSummary errors={errors} />

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            maxLength={100}
            required
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={256}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            aria-describedby="password-help"
            required
          />
          <p id="password-help" className="field-help">Use at least 12 characters.</p>

          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <AppLink to="/login">Sign in</AppLink>
        </p>
      </section>
    </main>
  )
}
