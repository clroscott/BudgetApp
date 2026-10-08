import { AppLink } from '../routing/AppLink'

export function HouseholdSectionNav({ current }: { current: 'members' | 'settings' | 'activity' }) {
  return <nav className="budgeting-section-nav" aria-label="Household pages">
    <AppLink to="/household" aria-current={current === 'members' ? 'page' : undefined}
      className={current === 'members' ? 'active' : undefined}>Members &amp; invitations</AppLink>
    <AppLink to="/household/settings" aria-current={current === 'settings' ? 'page' : undefined}
      className={current === 'settings' ? 'active' : undefined}>Settings</AppLink>
    <AppLink to="/activity" aria-current={current === 'activity' ? 'page' : undefined}
      className={current === 'activity' ? 'active' : undefined}>Change history</AppLink>
  </nav>
}
