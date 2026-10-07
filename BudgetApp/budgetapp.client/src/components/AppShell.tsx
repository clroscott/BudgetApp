import { useEffect, useRef, useState, type ReactNode } from 'react'
import { revealTutorialNavigationEvent } from '../tutorials/tutorialTargets'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { navigationPages } from '../routing/pageRegistry'
import { useRouter } from '../routing/useRouter'
import { skipNavigationEvent } from '../routing/pageFocus'
import { AppIcon } from './AppIcon'
import { BrandLockup } from './Brand'

const primaryNavigation = navigationPages('primary')
const settingsNavigation = navigationPages('settings')

function NavigationLinks({
  items,
  currentPath,
}: {
  items: ReturnType<typeof navigationPages>
  currentPath: string
}) {
  return items.map(item => (
    <AppLink
      className={currentPath === item.path ? 'active' : undefined}
      aria-current={currentPath === item.path ? 'page' : undefined}
      data-tutorial-id={`nav-${item.id}`}
      key={item.path}
      to={item.path}
      title={item.label}
    >
      <AppIcon className="sidebar-navigation-icon" name={item.icon!} />
      <span className="sidebar-label">{item.label}</span>
    </AppLink>
  ))
}

export function AppShell({ children, showHouseholdNavigation = true }: { children: ReactNode, showHouseholdNavigation?: boolean }) {
  const { logout, user } = useAuth()
  const {
    currentHousehold,
    households,
    selectHousehold,
  } = useHouseholds()
  const { confirmNavigation, navigate, path } = useRouter()
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const menu = menuRef.current
    const reveal = () => setIsNavigationOpen(true)
    const skip = () => setIsNavigationOpen(false)
    menu?.addEventListener(revealTutorialNavigationEvent, reveal)
    window.addEventListener(skipNavigationEvent, skip)
    return () => {
      menu?.removeEventListener(revealTutorialNavigationEvent, reveal)
      window.removeEventListener(skipNavigationEvent, skip)
    }
  }, [])
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
    if (!confirmNavigation()) return
    setIsSigningOut(true)
    setSignOutError(null)
    try {
      await logout()
      navigate('/login', { replace: true, bypassBlocker: true })
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
    <div className={`app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}${!showHouseholdNavigation ? ' standalone-account-shell' : ''}`}>
      <aside hidden={!showHouseholdNavigation} className={`app-sidebar${isNavigationOpen ? ' open' : ''}${isSidebarCollapsed ? ' collapsed' : ''}`}>
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
          data-tutorial-id="sidebar-menu"
          ref={menuRef}
          type="button"
          aria-expanded={isNavigationOpen}
          aria-controls="app-main-navigation"
          onClick={() => setIsNavigationOpen(open => !open)}
        >
          Menu
        </button>

        <nav id="app-main-navigation" className="sidebar-navigation" aria-label="Main navigation">
          <NavigationLinks items={primaryNavigation} currentPath={path} />
          <p>Settings</p>
          <NavigationLinks items={settingsNavigation} currentPath={path} />
        </nav>

        <div className="sidebar-footer">
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
      <div className="app-shell-content">
        <div className="household-context-bar" hidden={!showHouseholdNavigation}>
          <div className="household-context-current">
            <span className="household-context-label">Current household</span>
            {households.length > 1 ? (
              <select
                aria-label="Current household"
                value={currentHousehold?.id ?? ''}
                onChange={event => {
                  if (selectHousehold(event.target.value)) setIsNavigationOpen(false)
                }}
              >
                {households.map(household => (
                  <option key={household.id} value={household.id}>
                    {household.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{currentHousehold?.name}</strong>
            )}
            <span className="household-context-meta">
              {currentHousehold?.defaultCurrency} · {currentHousehold?.role}
            </span>
          </div>
          <AppLink className="household-context-manage" to="/household">
            Manage household
          </AppLink>
        </div>
        {children}
      </div>
    </div>
  )
}
