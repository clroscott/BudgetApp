import { useMemo, useState, type FormEvent } from 'react'
import { resetPassword } from '../auth/authApi'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function ResetPasswordPage() {
  const { refresh } = useAuth()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const recoveryParameters = useMemo(() => {
    const search = new URLSearchParams(window.location.search)
    return {
      userId: search.get('userId') ?? '',
      token: search.get('token') ?? '',
    }
  }, [])
  const hasRecoveryParameters =
    recoveryParameters.userId.length > 0 &&
    recoveryParameters.token.length > 0

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrors([])

    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get('newPassword') ?? '')
    const confirmPassword = String(form.get('confirmPassword') ?? '')

    if (newPassword !== confirmPassword) {
      setErrors(['Passwords do not match.'])
      setIsSubmitting(false)
      return
    }

    try {
      await resetPassword({
        ...recoveryParameters,
        newPassword,
      })
      await refresh()
      navigate('/login?passwordReset=true', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-password-heading">
        <header className="auth-header auth-header-centered">
          <BrandLogo />
          <h1 id="reset-password-heading">Choose a new password</h1>
          <p>Your new password must contain at least 12 characters.</p>
        </header>

        {!hasRecoveryParameters ? (
          <>
            <ErrorSummary errors={[
              'This password reset link is incomplete. Request a new recovery email.',
            ]} />
            <p className="auth-switch">
              <AppLink to="/forgot-password">Request a new link</AppLink>
            </p>
          </>
        ) : (
          <>
            <ErrorSummary errors={errors} />

            <form onSubmit={(event) => void handleSubmit(event)}>
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                autoFocus
              />

              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />

              <button
                className="primary-button"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Updating password…' : 'Update password'}
              </button>
            </form>

            <p className="auth-switch">
              <AppLink to="/forgot-password">Request a different link</AppLink>
            </p>
          </>
        )}
      </section>
    </main>
  )
}
