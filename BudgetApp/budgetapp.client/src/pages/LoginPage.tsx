import { useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function LoginPage() {
  const { login } = useAuth()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrors([])

    const form = new FormData(event.currentTarget)

    try {
      await login({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rememberMe: form.get('rememberMe') === 'on',
      })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <header className="auth-header">
          <span className="brand-mark" aria-hidden="true">B</span>
          <p className="eyebrow">BudgetApp</p>
          <h1 id="login-heading">Welcome back</h1>
          <p>Sign in to continue managing your household budget.</p>
        </header>

        <ErrorSummary errors={errors} />

        <form onSubmit={(event) => void handleSubmit(event)}>
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
            autoComplete="current-password"
            maxLength={128}
            required
          />

          <label className="checkbox-row">
            <input name="rememberMe" type="checkbox" />
            <span>Keep me signed in</span>
          </label>

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          New to BudgetApp? <AppLink to="/register">Create an account</AppLink>
        </p>
      </section>
    </main>
  )
}
