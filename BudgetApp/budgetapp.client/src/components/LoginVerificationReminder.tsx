import { AppLink } from '../routing/AppLink'

export function LoginVerificationReminder({ enabled }: { enabled: boolean }) {
  if (enabled !== false) return null
  return <section className="notice-card dashboard-security-prompt" aria-labelledby="dashboard-security-heading">
    <div><h2 id="dashboard-security-heading">Add protection to your account</h2>
      <p>Multi-factor authentication (MFA) is off. Require an email code after your password for extra protection.</p></div>
    <AppLink className="secondary-button" to="/settings/account">Set up MFA</AppLink>
  </section>
}
