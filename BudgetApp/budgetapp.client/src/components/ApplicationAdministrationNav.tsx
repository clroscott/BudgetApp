import { useAuth } from '../auth/useAuth'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'

export function ApplicationAdministrationNav() {
  const { user } = useAuth()
  const { path } = useRouter()
  const links = [{ to: '/admin/users', label: 'Users' }, { to: '/admin', label: 'Account support' }, ...(user?.isApplicationOwner ? [{ to: '/admin/administrators', label: 'Administrators' }] : [])]
  return <nav className="budgeting-section-nav" aria-label="Application administration sections">
    {links.map(link => <AppLink key={link.to} className={path === link.to ? 'active' : undefined} to={link.to} aria-current={path === link.to ? 'page' : undefined}>{link.label}</AppLink>)}
  </nav>
}
