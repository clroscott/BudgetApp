import { useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { requestPasswordRecovery } from '../auth/authApi'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'

export function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrors([])

    const form = new FormData(event.currentTarget)

    try {
      const result = await requestPasswordRecovery({
        email: String(form.get('email') ?? ''),
      })
      setConfirmation(result.message)
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="forgot-password-heading">
        <header className="auth-header auth-header-centered">
          <BrandLogo />
          <h1 id="forgot-password-heading">Reset your password</h1>
          <p>
            Enter your account email and we&apos;ll prepare recovery
            instructions.
          </p>
        </header>

        <ErrorSummary errors={errors} />

        {confirmation ? (
          <>
            <div className="success-summary" role="status">
              <strong>Check your email</strong>
              <span>{confirmation}</span>
            </div>
            <p className="auth-switch">
              Development messages are written to the configured local email
              outbox.
            </p>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={256}
              required
              autoFocus
            />

            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Preparing instructions…' : 'Send recovery instructions'}
            </button>
          </form>
        )}

        <p className="auth-switch">
          <AppLink to="/login">Return to sign in</AppLink>
        </p>
      </section>
    </main>
  )
}
