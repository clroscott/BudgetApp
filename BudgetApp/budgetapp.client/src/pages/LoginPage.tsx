import { useEffect, useState, type FormEvent } from 'react'
import { getPendingLogin, isPendingLogin, type VerificationChallenge } from '../auth/loginVerificationApi'
import { LoginVerificationStep } from '../components/LoginVerificationStep'
import { getErrorMessages } from '../auth/errorMessages'
import { getSafeReturnPath } from '../auth/returnPath'
import { useAuth } from '../auth/useAuth'
import { BrandLogo } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'

export function LoginPage() {
  const { login } = useAuth()
  const { navigate } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null)
  const [checking, setChecking] = useState(true)
  const [checkFailed, setCheckFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setChecking(true); setCheckFailed(false)
    void getPendingLogin().then(result => { if (active) setChallenge(result.challenge) })
      .catch(error => { if (active) { setErrors(getErrorMessages(error)); setCheckFailed(true) } })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [retry])
  const passwordWasReset =
    new URLSearchParams(window.location.search).get('passwordReset') === 'true'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrors([])

    const form = new FormData(event.currentTarget)

    try {
      const result = await login({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rememberMe: form.get('rememberMe') === 'on',
      })
      if (isPendingLogin(result)) { setChallenge(result.challenge); return }
      navigate(getSafeReturnPath() ?? '/dashboard', { replace: true })
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <header className="auth-header auth-header-centered">
          <BrandLogo />
          <h1 id="login-heading">{challenge ? 'Verify your sign-in' : 'Welcome back'}</h1>
          <p>Sign in to continue managing your household budget.</p>
        </header>

        <ErrorSummary errors={errors} />

        {passwordWasReset && (
          <div className="success-summary" role="status">
            <strong>Password updated</strong>
            <span>Sign in with your new password.</span>
          </div>
        )}

        {checking ? <p role="status">Checking for a pending sign-in…</p> : checkFailed ?
          <button type="button" onClick={() => { setErrors([]); setRetry(value => value + 1) }}>Retry checking sign-in</button> : challenge ?
          <LoginVerificationStep key={challenge.challengeId} initial={challenge} onCancel={() => { setChallenge(null); setErrors([]) }} /> :
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
          <div className="auth-form-link">
            <AppLink to="/forgot-password">Forgot your password?</AppLink>
          </div>

          <label className="checkbox-row">
            <input name="rememberMe" type="checkbox" />
            <span>Keep me signed in</span>
          </label>
          <p className="field-help">Keeps a completed sign-in session. It does not enable trusted-device verification bypass.</p>

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>}

        <p className="auth-switch">
          New to BudgetApp? <AppLink to="/register">Create an account</AppLink>
        </p>
      </section>
    </main>
  )
}
