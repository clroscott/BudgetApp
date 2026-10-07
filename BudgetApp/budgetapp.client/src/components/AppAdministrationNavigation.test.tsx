import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { AppShell } from './AppShell'

function show(admin: boolean, path = '/dashboard') {
  window.history.replaceState(null, '', path)
  const auth = authFixture(); auth.user = { ...auth.user!, isApplicationAdministrator: admin }
  return render(<RouterProvider><AuthContext.Provider value={auth}><HouseholdContext.Provider value={householdsFixture()}>
    <AppShell><main><h1>Example page</h1></main></AppShell>
  </HouseholdContext.Provider></AuthContext.Provider></RouterProvider>)
}
describe('operator navigation', () => {
  it('does not expose the operator entry just because a user has a household role', () => {
    show(false)
    expect(screen.queryByRole('link', { name: 'Application administration' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Account settings' })).toBeTruthy()
  })
  it('marks the operator page current and hides misleading selected-household context there', () => {
    const { container } = show(true, '/admin')
    const link = screen.getByRole('link', { name: 'Application administration' })
    expect(link.getAttribute('href')).toBe('/admin')
    expect(link.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('.household-context-bar')?.hasAttribute('hidden')).toBe(true)
  })
})
