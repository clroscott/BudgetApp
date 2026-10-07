import { useState, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from './auth/authApi'
import { confirmEmail } from './auth/authApi'
import { AuthContext } from './auth/authContext'
import { getHouseholds } from './households/householdApi'
import { getTutorialProgress } from './tutorials/tutorialProgressApi'
import { authFixture, household } from './test/fixtures'
import App from './App'

const scenario = vi.hoisted(() => ({ user: null as CurrentUser | null, refreshedUser: null as CurrentUser | null }))
vi.mock('./auth/AuthProvider', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState(scenario.user)
  return <AuthContext.Provider value={{ ...authFixture(), user, updateUser: setUser,
    refresh: async () => setUser(scenario.refreshedUser), logout: async () => setUser(null),
  }}>{children}</AuthContext.Provider>
} }))
vi.mock('./auth/authApi', async original => ({ ...await original<typeof import('./auth/authApi')>(),
  confirmEmail: vi.fn(), resendConfirmation: vi.fn(),
}))
vi.mock('./households/householdApi', async original => ({ ...await original<typeof import('./households/householdApi')>(), getHouseholds: vi.fn() }))
vi.mock('./tutorials/tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
vi.mock('./pages/BudgetManagementPage', () => ({ BudgetManagementPage: () => <main><h1>Private monthly budget</h1></main> }))

beforeEach(() => {
  vi.clearAllMocks()
  scenario.user = { ...authFixture().user!, emailConfirmed: false }
  scenario.refreshedUser = { ...scenario.user, emailConfirmed: true }
  vi.mocked(getHouseholds).mockResolvedValue([household])
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(confirmEmail).mockResolvedValue(scenario.refreshedUser)
})

describe('full app verification gate', () => {
  it('keeps an already signed-in user on the confirmation journey instead of returning them to login or losing the link', async () => {
    window.history.replaceState(null, '', '/login?returnTo=%2Fconfirm-email%3FuserId%3Dtest-user%26token%3Dproof')
    render(<App />)
    await screen.findByRole('button', { name: 'Confirm email address' })
    expect(window.location.pathname + window.location.search).toBe('/confirm-email?userId=test-user&token=proof')
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(confirmEmail).not.toHaveBeenCalled()
  })
  it('honors the intended app destination when an already verified user reaches a sign-in link', async () => {
    scenario.user = scenario.refreshedUser
    window.history.replaceState(null, '', '/login?returnTo=%2Fbudgeting%3Fscope%3DPersonal')
    render(<App />)
    await screen.findByRole('heading', { name: 'Private monthly budget' })
    expect(window.location.pathname + window.location.search).toBe('/budgeting?scope=Personal')
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })
  it('does not loop when a signed-in user reaches a sign-in URL pointing back to sign-in', async () => {
    window.history.replaceState(null, '', '/login?returnTo=%2Flogin')
    render(<App />)
    await screen.findByRole('heading', { name: 'Confirm your email' })
    expect(window.location.pathname).toBe('/verify-email')
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/dashboard')
  })
  it.each(['/dashboard', '/household', '/household/setup', '/households/new', '/household/settings',
    '/transactions', '/import', '/imports/review', '/budgeting', '/budgeting/annual-targets',
    '/budgeting/annual-overview', '/accounts', '/categories', '/tutorials',
    '/household-invitations/accept?token=private-invitation'])
  ('redirects unverified users away from %s without loading private data', async path => {
    window.history.replaceState(null, '', path)
    localStorage.setItem('budgetapp.selected-household.test-user', household.id)
    render(<App />)
    await screen.findByRole('heading', { name: 'Confirm your email' })
    expect(window.location.pathname).toBe('/verify-email')
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(path)
    expect(getHouseholds).not.toHaveBeenCalled()
    expect(getTutorialProgress).not.toHaveBeenCalled()
    expect(document.querySelector('.app-sidebar')).toBeNull()
    expect(screen.getByRole('note', { name: 'Your data is safe' })).toBeTruthy()
    expect(localStorage.getItem('budgetapp.selected-household.test-user')).toBe(household.id)
    expect(document.title).toBe('Confirm your email | MC Budget')
  })

  it('lets an unverified user open the confirmation link, but never consumes it automatically', async () => {
    window.history.replaceState(null, '', '/confirm-email?userId=test-user&token=proof')
    render(<App />)
    await screen.findByRole('button', { name: 'Confirm email address' })
    expect(confirmEmail).not.toHaveBeenCalled()
    expect(getHouseholds).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm email address' }))
    await screen.findByRole('heading', { name: 'Email confirmed' })
    await waitFor(() => expect(getHouseholds).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getTutorialProgress).toHaveBeenCalledTimes(1))
  })

  it('refreshes status and returns to the requested page only after verification', async () => {
    window.history.replaceState(null, '', '/budgeting?year=2026&month=1&scope=Personal')
    render(<App />)
    await screen.findByRole('heading', { name: 'Confirm your email' })
    fireEvent.click(screen.getByRole('button', { name: 'Check confirmation status' }))
    const continueLink = await screen.findByRole('link', { name: 'Continue' })
    fireEvent.click(continueLink)
    await screen.findByRole('heading', { name: 'Private monthly budget' })
    expect(window.location.pathname + window.location.search).toBe('/budgeting?year=2026&month=1&scope=Personal')
    expect(localStorage.getItem('budgetapp.selected-household.test-user')).toBe(household.id)
  })

  it('permits password recovery for a signed-in unverified user', async () => {
    window.history.replaceState(null, '', '/forgot-password')
    render(<App />)
    await screen.findByRole('heading', { name: 'Reset your password' })
    expect(window.location.pathname).toBe('/forgot-password')
    expect(getHouseholds).not.toHaveBeenCalled()
  })

  it('keeps sign-out available on the gate page', async () => {
    window.history.replaceState(null, '', '/verify-email')
    render(<App />)
    await screen.findByRole('heading', { name: 'Confirm your email' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('button', { name: 'Sign in' })
    expect(window.location.pathname).toBe('/login')
    expect(getHouseholds).not.toHaveBeenCalled()
  })
})
