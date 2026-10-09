import { useEffect, useRef, useState, type ReactNode } from 'react'
import { revealTutorialNavigationEvent } from '../tutorials/tutorialTargets'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { groupForPath, mainNavigationGroups } from '../routing/navigationGroups'
import { useRouter } from '../routing/useRouter'
import { skipNavigationEvent } from '../routing/pageFocus'
import { AppIcon } from './AppIcon'
import { BrandLockup } from './Brand'

export function AppShell({ children, showHouseholdNavigation = true }: { children: ReactNode, showHouseholdNavigation?: boolean }) {
  const { logout, user } = useAuth()
  const {
    currentHousehold,
    households,
    selectHousehold,
  } = useHouseholds()
  const { confirmNavigation, navigate, path } = useRouter()
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const profileRef = useRef<HTMLDetailsElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const shell = shellRef.current
    const sidebar = sidebarRef.current
    if (!shell || !sidebar) return
    // CSS uses this only in the narrow layout. Measure actual wrapped/open menu
    // height rather than assuming a breakpoint-specific fixed header size.
    const measure = () => {
      const height = Math.ceil(sidebar.getBoundingClientRect().height)
      const value = `${height}px`
      if (shell.style.getPropertyValue('--shell-navigation-height') !== value) {
        shell.style.setProperty('--shell-navigation-height', value)
      }
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(sidebar)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      shell.style.removeProperty('--shell-navigation-height')
    }
  }, [showHouseholdNavigation, isNavigationOpen, expandedGroups])
  useEffect(() => {
    const menu = menuRef.current
    const reveal = () => setIsNavigationOpen(true)
    const revealSection = (event: Event) => {
      const targetId = (event as CustomEvent<{ targetId?: string }>).detail?.targetId
      const group = mainNavigationGroups.find(item => item.children.some(page => `nav-${page.id}` === targetId))
      if (group) setExpandedGroups(current => current[group.id] ? current : { ...current, [group.id]: true })
    }
    const skip = () => setIsNavigationOpen(false)
    menu?.addEventListener(revealTutorialNavigationEvent, reveal)
    window.addEventListener(skipNavigationEvent, skip)
    window.addEventListener(revealTutorialNavigationEvent, revealSection)
    return () => {
      menu?.removeEventListener(revealTutorialNavigationEvent, reveal)
      window.removeEventListener(skipNavigationEvent, skip)
      window.removeEventListener(revealTutorialNavigationEvent, revealSection)
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
  useEffect(() => {
    setIsNavigationOpen(false)
    if (profileRef.current) profileRef.current.open = false
  }, [path])
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target) && profileRef.current) profileRef.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])

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
    <div ref={shellRef} className={`app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}${!showHouseholdNavigation ? ' standalone-account-shell' : ''}`}>
      <aside ref={sidebarRef} hidden={!showHouseholdNavigation} className={`app-sidebar${isNavigationOpen ? ' open' : ''}${isSidebarCollapsed ? ' collapsed' : ''}`}>
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
          {mainNavigationGroups.map(group => {
            const active = groupForPath(path)?.id === group.id
            const expanded = expandedGroups[group.id] ?? active
            return <div className="sidebar-group" data-navigation-group={group.id} key={group.id}>
              <div className="sidebar-group-heading">
                <AppLink to={group.page.path} title={group.label} aria-label={group.label}
                  className={active ? 'active' : undefined}
                  aria-current={path === group.page.path ? 'page' : active ? 'location' : undefined}
                  data-tutorial-id={`nav-${group.page.id}`}>
                  <AppIcon className="sidebar-navigation-icon" name={group.page.icon!} />
                  <span className="sidebar-label">{group.label}</span>
                </AppLink>
                {group.children.length > 0 && <button type="button" className="sidebar-group-toggle"
                  aria-expanded={expanded} aria-controls={`navigation-${group.id}`}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.label} navigation`}
                  onClick={() => setExpandedGroups(current => ({ ...current, [group.id]: !expanded }))}>
                  <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>}
              </div>
              {group.children.length > 0 && <div id={`navigation-${group.id}`} className="sidebar-children" hidden={!expanded}>
                {group.children.map(page => <AppLink to={page.path} key={page.id} title={page.label} aria-label={page.label}
                  className={path === page.path ? 'active' : undefined} aria-current={path === page.path ? 'page' : undefined}
                  data-tutorial-id={`nav-${page.id}`}>
                  <AppIcon className="sidebar-navigation-icon" name={page.icon ?? 'household'} />
                  <span className="sidebar-label">{page.label}</span>
                </AppLink>)}
              </div>}
            </div>
          })}
        </nav>

        <div className="sidebar-footer"><small className="sidebar-label">Track. Plan. Grow together.</small></div>
      </aside>
      <div className="app-shell-content">
        <div className="app-context-header">
        <div className="household-context-bar" hidden={!showHouseholdNavigation || path.startsWith('/admin')}>
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
        {user && <details className="profile-menu" ref={profileRef}
          onKeyDown={event => {
            if (event.key === 'Escape' && profileRef.current?.open) {
              event.stopPropagation(); profileRef.current.open = false
              profileRef.current.querySelector('summary')?.focus()
            }
          }}>
          <summary><AppIcon name="user" /><span>{user.displayName}</span><span className="visually-hidden"> — Profile menu</span></summary>
          <div className="profile-menu-content">
            <p>Your personal account</p>
            <AppLink to="/settings/account" aria-current={path === '/settings/account' ? 'page' : undefined}>Account settings</AppLink>
            <AppLink to="/help">Help</AppLink>
            {user.isApplicationAdministrator && <AppLink to="/admin" aria-current={path === '/admin' ? 'page' : path.startsWith('/admin/') ? 'location' : undefined}>Application administration</AppLink>}
            {signOutError && <p className="sidebar-error" role="alert">{signOutError}</p>}
            <button className="text-button" type="button" disabled={isSigningOut} onClick={() => void handleLogout()}>
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </details>}
        </div>
        {children}
      </div>
    </div>
  )
}
