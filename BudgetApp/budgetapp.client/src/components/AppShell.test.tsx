import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { RouterProvider } from '../routing/RouterProvider'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { authFixture, householdsFixture } from '../test/fixtures'
import { revealTutorialNavigationEvent } from '../tutorials/tutorialTargets'
import { AppShell } from './AppShell'

function show({ path = '/dashboard', administrator = false, noHousehold = false, dirty = false } = {}) {
  window.history.replaceState(null, '', path)
  const auth = authFixture()
  auth.user = { ...auth.user!, isApplicationAdministrator: administrator }
  const households = householdsFixture()
  if (noHousehold) { households.currentHousehold = null; households.households = [] }
  function Content() { useUnsavedChangesGuard(dirty, 'Discard changes?'); return <main><h1>Example page</h1></main> }
  return { ...render(<AuthContext.Provider value={auth}><RouterProvider><HouseholdContext.Provider value={households}>
    <AppShell showHouseholdNavigation={!noHousehold}><Content /></AppShell>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>), auth }
}
beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(false) })

describe('grouped application navigation', () => {
  it('starts with six clear destinations and keeps secondary pages under their section', () => {
    show()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual([
      'Dashboard', 'Transactions', 'Budgeting', 'Financial accounts', 'Household', 'Help',
    ])
    expect(within(nav).queryByRole('link', { name: 'Import transactions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Transactions navigation' }))
    expect(within(nav).getByRole('link', { name: 'Import transactions' }).getAttribute('data-tutorial-id')).toBe('nav-import')
    expect(within(nav).getByRole('link', { name: 'Review imports' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Transactions navigation' }))
    expect(within(nav).queryByRole('link', { name: 'Import transactions' })).toBeNull()
  })
  it('exposes current section and current child independently, with navigation guards intact', () => {
    show({ path: '/imports/review', dirty: true })
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Transactions' }).getAttribute('aria-current')).toBe('location')
    expect(within(nav).getByRole('link', { name: 'Review imports' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(nav).getByRole('link', { name: 'Import transactions' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/imports/review')
  })
  it('reveals a tutorial child without changing the route, saving data or expanding the desktop sidebar', () => {
    localStorage.setItem('budgetapp.sidebar-collapsed.test-user', 'true')
    const view = show()
    act(() => window.dispatchEvent(new CustomEvent(revealTutorialNavigationEvent, { detail: { targetId: 'nav-import' } })))
    expect(screen.getByRole('link', { name: 'Import transactions' })).toBeTruthy()
    expect(view.container.querySelector('.app-sidebar.collapsed')).toBeTruthy()
    expect(window.location.pathname).toBe('/dashboard')
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('keeps personal settings available without a household and returns focus when closing the profile menu', () => {
    const view = show({ noHousehold: true })
    const menu = view.container.querySelector<HTMLDetailsElement>('.profile-menu')!
    const summary = menu.querySelector('summary')!
    menu.open = true
    const account = within(menu).getByRole('link', { name: 'Account settings' })
    account.focus()
    fireEvent.keyDown(account, { key: 'Escape' })
    expect(menu.open).toBe(false)
    expect(document.activeElement).toBe(summary)
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Application administration' })).toBeNull()
  })
  it('keeps application administration separate and guards sign-out', () => {
    const view = show({ administrator: true, dirty: true })
    const menu = view.container.querySelector<HTMLDetailsElement>('.profile-menu')!
    menu.open = true
    expect(within(menu).getByRole('link', { name: 'Application administration' }).getAttribute('href')).toBe('/admin')
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).queryByRole('link', { name: 'Application administration' })).toBeNull()
    fireEvent.click(within(menu).getByRole('button', { name: 'Sign out' }))
    expect(view.auth.logout).not.toHaveBeenCalled()
    expect(window.confirm).toHaveBeenCalledOnce()
  })
})
