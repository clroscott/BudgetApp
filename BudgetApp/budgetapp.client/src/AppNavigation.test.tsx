import { useEffect, useState, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from './auth/authContext'
import { useHouseholds } from './households/useHouseholds'
import { getHouseholds } from './households/householdApi'
import { getTutorialProgress } from './tutorials/tutorialProgressApi'
import { useRouter } from './routing/useRouter'
import { useUnsavedChangesGuard } from './routing/useUnsavedChangesGuard'
import { authFixture, household, otherHousehold } from './test/fixtures'
import App from './App'

const { mounted } = vi.hoisted(() => ({ mounted: vi.fn() }))
vi.mock('./auth/AuthProvider', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => {
  const [auth] = useState(authFixture)
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
} }))
vi.mock('./households/householdApi', async original => ({
  ...await original<typeof import('./households/householdApi')>(), getHouseholds: vi.fn(),
}))
vi.mock('./tutorials/tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
vi.mock('./routing/pageRegistry', () => {
  const pages = [
    { id: 'household', path: '/household', label: 'Household', access: 'household', component: FixturePage, icon: 'household', navigation: { section: 'primary' } },
    { id: 'accounts', path: '/accounts', label: 'Accounts', access: 'household', component: FixturePage, icon: 'accounts', navigation: { section: 'primary' } },
    { id: 'login', path: '/login', label: 'Log in', access: 'public', component: FixturePage },
  ]
  return { appPages: pages, navigationPages: (section: string) => pages.filter(page => page.navigation?.section === section) }
})

function FixturePage() {
  const { currentHousehold } = useHouseholds()
  const { path } = useRouter()
  const [value, setValue] = useState('original')
  const [scope, setScope] = useState('Household')
  useUnsavedChangesGuard(value !== 'original', 'Discard fixture edit?')
  useEffect(() => { mounted(currentHousehold?.id) }, [currentHousehold?.id])
  return <main><h1>{path === '/accounts' ? 'Accounts' : currentHousehold?.name ?? 'Log in'}</h1>
    <label>Fixture edit<input value={value} onChange={e => setValue(e.target.value)} /></label>
    <label>Fixture scope<select value={scope} onChange={e => setScope(e.target.value)}><option>Household</option><option>Personal</option></select></label>
  </main>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getHouseholds).mockResolvedValue([household, otherHousehold])
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  window.history.replaceState(null, '', '/household')
})

describe('full app shell focus and household boundaries', () => {
  it('keeps the household switcher node/focus while remounting the household-specific editor', async () => {
    render(<App />)
    const selector = await screen.findByLabelText('Current household') as HTMLSelectElement
    const oldInput = screen.getByLabelText('Fixture edit')
    fireEvent.change(oldInput, { target: { value: 'changed' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    selector.focus()
    fireEvent.change(selector, { target: { value: otherHousehold.id } })
    await screen.findByRole('heading', { name: otherHousehold.name })
    expect(document.activeElement).toBe(selector)
    expect(screen.getByLabelText('Current household')).toBe(selector)
    expect(screen.getByLabelText('Fixture edit')).not.toBe(oldInput)
    expect((screen.getByLabelText('Fixture edit') as HTMLInputElement).value).toBe('original')
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith('Discard fixture edit?')
    expect(document.title).toBe('Household | MC Budget')
    expect(document.querySelector('.page-announcement')!.textContent).toBe('')
    expect(mounted.mock.calls.map(call => call[0])).toEqual([household.id, otherHousehold.id])
  })

  it('does not change focus on a canceled household switch or ordinary scope change', async () => {
    render(<App />)
    const selector = await screen.findByLabelText('Current household') as HTMLSelectElement
    const edit = screen.getByLabelText('Fixture edit')
    fireEvent.change(edit, { target: { value: 'changed' } })
    selector.focus()
    fireEvent.change(selector, { target: { value: otherHousehold.id } })
    expect(selector.value).toBe(household.id)
    expect(document.activeElement).toBe(selector)
    expect((edit as HTMLInputElement).value).toBe('changed')
    const scope = screen.getByLabelText('Fixture scope')
    scope.focus()
    fireEvent.change(scope, { target: { value: 'Personal' } })
    expect(document.activeElement).toBe(scope)
    expect(document.querySelector('.page-announcement')!.textContent).toBe('')
  })

  it('applies meaningful titles and focus via the real AppRoutes boundary', async () => {
    render(<App />)
    await screen.findByLabelText('Current household')
    fireEvent.click(screen.getByRole('link', { name: 'Financial accounts' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Accounts' })))
    expect(document.title).toBe('Accounts | MC Budget')
    expect(document.querySelector('.page-announcement')!.textContent).toBe('Accounts page loaded.')
    expect(screen.getByRole('link', { name: 'Financial accounts' }).getAttribute('aria-current')).toBe('page')
  })
})
