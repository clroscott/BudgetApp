import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/apiClient'
import { getCurrentUser } from './auth/authApi'
import { useAuth } from './auth/useAuth'
import { getHouseholds } from './households/householdApi'
import { useHouseholds } from './households/useHouseholds'
import { getTutorialProgress } from './tutorials/tutorialProgressApi'
import { useUnsavedChangesGuard } from './routing/useUnsavedChangesGuard'
import { authFixture, household } from './test/fixtures'
import { deferred } from './test/deferred'
import App from './App'

const { mounted } = vi.hoisted(() => ({ mounted: vi.fn() }))
vi.mock('./auth/authApi', async original => ({ ...await original<typeof import('./auth/authApi')>(), getCurrentUser: vi.fn() }))
vi.mock('./households/householdApi', async original => ({ ...await original<typeof import('./households/householdApi')>(), getHouseholds: vi.fn() }))
vi.mock('./tutorials/tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
vi.mock('./routing/pageRegistry', () => {
  const pages = [
    { id: 'accounts', path: '/accounts', label: 'Accounts', access: 'household', component: Editor, icon: 'accounts', navigation: { section: 'primary' } },
    { id: 'login', path: '/login', label: 'Log in', access: 'public', component: () => <main><h1>Signed out fixture</h1></main> },
    { id: 'setup', path: '/household/setup', label: 'Set up household', access: 'household-setup', component: () => <main><h1>Create household fixture</h1></main> },
  ]
  return { appPages: pages, navigationPages: (section: string) => pages.filter(page => page.navigation?.section === section) }
})
function Editor() {
  const { refresh: refreshSession } = useAuth()
  const { refresh: refreshMemberships } = useHouseholds()
  const [value, setValue] = useState('original')
  useUnsavedChangesGuard(value !== 'original', 'Keep fixture correction?')
  useEffect(() => { mounted() }, [])
  return <main><h1>Financial editor fixture</h1>
    <label>Pending fixture correction<input value={value} onChange={event => setValue(event.target.value)} /></label>
    <button onClick={() => void refreshSession()}>Refresh fixture session</button>
    <button onClick={() => void refreshMemberships()}>Refresh fixture memberships</button>
  </main>
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue(authFixture().user)
  vi.mocked(getHouseholds).mockReset().mockResolvedValue([household])
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  window.history.replaceState(null, '', '/accounts')
})
describe('provider refresh feedback in the real app shell', () => {
  it.each(['session', 'memberships'] as const)('retains the editor through a %s refresh failure and safe retry', async subject => {
    render(<App />)
    const input = await screen.findByLabelText('Pending fixture correction') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Keep this correction' } })
    const read = deferred<never>()
    if (subject === 'session') vi.mocked(getCurrentUser).mockReturnValueOnce(read.promise)
    else vi.mocked(getHouseholds).mockReturnValueOnce(read.promise)
    fireEvent.click(screen.getByText(`Refresh fixture ${subject}`))
    expect(screen.getByLabelText('Pending fixture correction')).toBe(input)
    expect(input.closest('[inert]')).toBeTruthy()
    await act(async () => read.reject(new Error('Temporary fixture outage')))
    const feedback = await screen.findByRole('alert', { name: `${subject === 'session' ? 'your session' : 'household memberships'} load status` })
    expect(input.value).toBe('Keep this correction')
    expect(input.closest('[inert]')).toBeTruthy()
    fireEvent.click(within(feedback).getByRole('button', { name: 'Retry loading' }))
    await waitFor(() => expect(input.closest('[inert]')).toBeNull())
    expect(screen.getByLabelText('Pending fixture correction')).toBe(input)
    expect(input.value).toBe('Keep this correction')
    expect(mounted).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('link', { name: 'Help' }))
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith('Keep fixture correction?')
    expect(input.value).toBe('Keep this correction')
  })
  it('does not offer setup or claim no household after an initial membership failure', async () => {
    vi.mocked(getHouseholds).mockRejectedValue(new Error('Initial membership outage'))
    render(<App />)
    await screen.findByText('Initial membership outage')
    expect(screen.queryByText('Create household fixture')).toBeNull()
    expect(screen.queryByLabelText('Pending fixture correction')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
  it('offers setup after a genuinely successful empty membership response', async () => {
    vi.mocked(getHouseholds).mockResolvedValue([])
    render(<App />)
    await screen.findByText('Create household fixture')
    expect(screen.queryByText('MC Budget is unavailable')).toBeNull()
  })
  it.each(['session', 'memberships'] as const)('removes retained financial data after %s access is revoked', async subject => {
    render(<App />)
    await screen.findByLabelText('Pending fixture correction')
    if (subject === 'session') vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
    else vi.mocked(getHouseholds).mockRejectedValueOnce(new ApiError('Membership access revoked', 403))
    fireEvent.click(screen.getByText(`Refresh fixture ${subject}`))
    await screen.findByText(subject === 'session' ? 'Signed out fixture' : 'Membership access revoked')
    expect(screen.queryByLabelText('Pending fixture correction')).toBeNull()
  })
})
