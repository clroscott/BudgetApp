import { useState, type ReactNode } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { useRouter } from '../routing/useRouter'
import { AppIcon, type AppIconName } from './AppIcon'
import { BrandLockup } from './Brand'

interface NavigationItem {
  icon: AppIconName
  label: string
  to: string
}

const primaryNavigation: NavigationItem[] = [
  { icon: 'dashboard', label: 'Dashboard', to: '/dashboard' },
  { icon: 'transactions', label: 'Transactions', to: '/transactions' },
  { icon: 'import', label: 'Import transactions', to: '/import' },
  { icon: 'review', label: 'Review imports', to: '/imports/review' },
  { icon: 'budget', label: 'Monthly budget', to: '/budgeting' },
  {
    icon: 'recurring',
    label: 'Recurring expenses',
    to: '/budgeting/recurring-expenses',
  },
  { icon: 'accounts', label: 'Accounts', to: '/accounts' },
]

const settingsNavigation: NavigationItem[] = [
  { icon: 'categories', label: 'Categories', to: '/settings/categories' },
  { icon: 'profiles', label: 'CSV profiles', to: '/settings/import-profiles' },
]

function NavigationLinks({
  items,
  currentPath,
}: {
  items: NavigationItem[]
  currentPath: string
}) {
  return items.map(item => (
    <AppLink
      className={currentPath === item.to ? 'active' : undefined}
      key={item.to}
      to={item.to}
      title={item.label}
    >
      <AppIcon className="sidebar-navigation-icon" name={item.icon} />
      <span className="sidebar-label">{item.label}</span>
    </AppLink>
  ))
}

export function AppShell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth()
  const { currentHousehold } = useHouseholds()
  const { navigate, path } = useRouter()
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (!user) return false
    try {
      return localStorage.getItem(
        `budgetapp.sidebar-collapsed.${user.id}`,
      ) === 'true'
    } catch {
      return false
    }
  })
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const handleLogout = async () => {
    setIsSigningOut(true)
    setSignOutError(null)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setSignOutError(getErrorMessages(error)[0] ?? 'Unable to sign out.')
      setIsSigningOut(false)
    }
  }

  const toggleSidebar = () => {
    setIsSidebarCollapsed(collapsed => {
      const next = !collapsed
      if (user) {
        try {
          localStorage.setItem(
            `budgetapp.sidebar-collapsed.${user.id}`,
            String(next),
          )
        } catch {
          // The sidebar still works when browser storage is unavailable.
        }
      }
      return next
    })
  }

  return (
    <div className={`app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className={`app-sidebar${isNavigationOpen ? ' open' : ''}${isSidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-top">
          <AppLink className="sidebar-brand" to="/dashboard" title="Dashboard">
            <BrandLockup />
          </AppLink>
          <button
            className="sidebar-collapse-button"
            type="button"
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
          >
            {isSidebarCollapsed ? '›' : '‹'}
          </button>
        </div>
        <button
          className="sidebar-menu-button secondary-button"
          type="button"
          aria-expanded={isNavigationOpen}
          onClick={() => setIsNavigationOpen(open => !open)}
        >
          Menu
        </button>

        <nav className="sidebar-navigation" aria-label="Main navigation">
          <NavigationLinks items={primaryNavigation} currentPath={path} />
          <p>Settings</p>
          <NavigationLinks items={settingsNavigation} currentPath={path} />
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-household">
            <strong>{currentHousehold?.name}</strong>
            <small>
              {currentHousehold?.defaultCurrency} / {currentHousehold?.role}
            </small>
          </div>
          {signOutError && <small className="sidebar-error">{signOutError}</small>}
          <button
            className="text-button"
            type="button"
            title="Sign out"
            disabled={isSigningOut}
            onClick={() => void handleLogout()}
          >
            <svg
              className="sidebar-navigation-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 4H4v16h6" />
              <path d="M14 8l4 4-4 4" />
              <path d="M8 12h10" />
            </svg>
            <span className="sidebar-label">
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </span>
          </button>
        </div>
      </aside>
      <div className="app-shell-content">{children}</div>
    </div>
  )
}
