import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/apiClient'
import { getErrorMessages } from '../auth/errorMessages'
import { emailVerificationPath } from '../auth/emailVerification'
import { getSafeReturnPath } from '../auth/returnPath'
import { useAuth } from '../auth/useAuth'
import { isPendingLogin } from '../auth/loginVerificationApi'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function RegisterPage() {
  const { register, login } = useAuth()
  const { navigate } = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const signInPath = `/login?returnTo=${encodeURIComponent(getSafeReturnPath() ?? '/household/setup')}`
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
      const email = String(form.get('email') ?? '')
      const result = await register({
        displayName: String(form.get('displayName') ?? ''),
        email,
        password,
      })
      setMessage(result.message)
      // Registration stays generic. Sign in through the normal credential check
      // for both new and existing addresses, without storing the entered password.
      try {
        const currentUser = await login({ email, password, rememberMe: false })
        const returnTo = getSafeReturnPath() ?? '/household/setup'
        if (isPendingLogin(currentUser)) {
          navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
          return
        }
        navigate(currentUser.emailConfirmed ? returnTo : emailVerificationPath(returnTo), { replace: true })
      } catch (error) {
        // An existing address with different credentials receives the same generic
        // registration guidance, not an account-existence signal.
        if (!(error instanceof ApiError && error.status === 401)) {
          setErrors(getErrorMessages(error))
        }
      }
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-heading">
        <header className="auth-header auth-header-centered">
          <BrandLogo />
          <h1 id="register-heading">Create your account</h1>
          <p>Create your account, then confirm your email to access MC Budget.</p>
        </header>

        <ErrorSummary errors={errors} />

        {message ? <div className="notice-card" role="status">
          <h2>Check your email</h2><p>{message}</p>
          <p>Sign in to the account you just created, then open the confirmation link. Links expire after one hour.</p>
          <AppLink className="primary-link-button" to={signInPath}>Sign in</AppLink>
          <p><AppLink to="/resend-confirmation">Need another confirmation link?</AppLink></p>
          <AppLink to="/forgot-password">Reset your password</AppLink>
        </div> : <form onSubmit={(event) => void handleSubmit(event)}>
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
        </form>}

        <p className="auth-switch">
          Already have an account? <AppLink to={signInPath}>Sign in</AppLink>
        </p>
      </section>
    </main>
  )
}
