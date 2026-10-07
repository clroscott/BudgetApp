import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { AppShell } from '../components/AppShell'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { authFixture, householdsFixture } from '../test/fixtures'
import { TutorialContext, type TutorialContextValue } from '../tutorials/tutorialContext'
import { tutorialDefinitions } from '../tutorials/tutorialDefinitions'
import { PageNavigation } from './PageNavigation'
import { RouterProvider } from './RouterProvider'
import { AppLink } from './AppLink'
import { useRouter } from './useRouter'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

function tutorialContext(): TutorialContextValue {
  return { activeTutorial: null, activeStepIndex: 0, progress: [], isLoading: false, error: null,
    start: vi.fn(async () => {}), dismiss: vi.fn(async () => {}), exit: vi.fn(async () => {}),
    back: vi.fn(async () => {}), next: vi.fn(async () => {}) }
}
function show({ delayed = false, initialPath = '/dashboard', shell = false, noHeading = false, mainId }: {
  delayed?: boolean, initialPath?: string, shell?: boolean, noHeading?: boolean, mainId?: string,
} = {}) {
  window.history.replaceState(null, '', initialPath)
  let markReady!: () => void
  const tutorial = tutorialContext()
  function Routes() {
    const { path, navigate } = useRouter()
    const [ready, setReady] = useState(!delayed)
    const [dirty, setDirty] = useState(false)
    const [filter, setFilter] = useState('')
    const [scope, setScope] = useState('Household')
    markReady = () => setReady(true)
    useUnsavedChangesGuard(dirty, 'Keep your unsaved edit?')
    const heading = path === '/dashboard' ? 'Dashboard heading' : path === '/accounts' ? 'Accounts heading' : 'Transactions heading'
    const content = <><nav aria-label="Fixture navigation">
      <AppLink to="/dashboard">Dashboard link</AppLink><AppLink to="/accounts">Accounts link</AppLink><AppLink to="/transactions">Transactions link</AppLink>
    </nav><main key={path} id={mainId} aria-busy={path === '/accounts' && !ready ? true : undefined}>
      {path === '/accounts' && !ready ? <p>Loading delayed page</p> : <>
        {!noHeading && <h1>{heading}</h1>}
        <label>Filter<input value={filter} onChange={e => { setFilter(e.target.value); navigate(`${path}?query=${e.target.value}`) }} /></label>
        <label>Scope<select value={scope} onChange={e => setScope(e.target.value)}><option>Household</option><option>Personal</option></select></label>
        <label>Unsaved edit<input onChange={() => setDirty(true)} /></label>
        <button>Page action</button>
      </>}
    </main></>
    return shell ? <AppShell>{content}</AppShell> : content
  }
  const contents = () => <RouterProvider><AuthContext.Provider value={authFixture()}>
    <HouseholdContext.Provider value={householdsFixture()}><TutorialContext.Provider value={tutorial}>
      <PageNavigation><Routes /></PageNavigation>
    </TutorialContext.Provider></HouseholdContext.Provider>
  </AuthContext.Provider></RouterProvider>
  const result = render(contents())
  return { ...result, ready: () => act(() => markReady()), tutorial,
    updateTutorial: (active: boolean) => { tutorial.activeTutorial = active ? tutorialDefinitions[0] : null; result.rerender(contents()) } }
}
const announcement = () => document.querySelector<HTMLElement>('.page-announcement')!

describe('shared page navigation', () => {
  it('assigns a meaningful initial title without stealing focus or announcing a fake transition', () => {
    show()
    expect(document.title).toBe('Dashboard | MC Budget')
    expect(document.activeElement).toBe(document.body)
    expect(announcement().textContent).toBe('')
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#main-content')
    expect(screen.getByRole('main').id).toBe('main-content')
  })

  it('focuses the destination heading and announces its registry name on a real page change', async () => {
    show()
    fireEvent.click(screen.getByText('Accounts link'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Accounts heading' })))
    expect(document.title).toBe('Accounts | MC Budget')
    expect(announcement().textContent).toBe('Accounts page loaded.')
    const heading = screen.getByRole('heading', { name: 'Accounts heading' })
    expect(heading.getAttribute('tabindex')).toBe('-1')
    expect(heading.hasAttribute('data-page-focus-target')).toBe(true)
    screen.getByRole('button', { name: 'Page action' }).focus()
    expect(heading.hasAttribute('tabindex')).toBe(false)
    expect(heading.hasAttribute('data-page-focus-target')).toBe(false)
  })

  it('Skip works without route/hash changes or an unsaved-change prompt', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Unsaved edit'), { target: { value: 'Pending' } })
    const originalUrl = window.location.href
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    try {
      const link = screen.getByRole('link', { name: 'Skip to main content' })
      link.focus()
      fireEvent.click(link)
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Dashboard heading' })))
      expect(window.location.href).toBe(originalUrl)
      expect(window.confirm).not.toHaveBeenCalled()
      expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    } finally { Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView') }
  })

  it('preserves an existing main ID and can focus an empty main without a heading', async () => {
    show({ noHeading: true, mainId: 'custom-main' })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    try {
      expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#custom-main')
      fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }))
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
      expect(screen.getByRole('main').id).toBe('custom-main')
    } finally { Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView') }
  })

  it('does not change focus/title/announcements for filter, query-string, or scope changes', async () => {
    show({ initialPath: '/accounts' })
    const filter = screen.getByLabelText('Filter')
    filter.focus()
    fireEvent.change(filter, { target: { value: 'rent' } })
    await act(async () => { await Promise.resolve() })
    expect(document.activeElement).toBe(filter)
    expect(document.title).toBe('Accounts | MC Budget')
    expect(announcement().textContent).toBe('')
    const scope = screen.getByLabelText('Scope')
    scope.focus()
    fireEvent.change(scope, { target: { value: 'Personal' } })
    expect(document.activeElement).toBe(scope)
    expect(announcement().textContent).toBe('')
  })

  it('canceled navigation preserves the current edit, focus, title, and announcement', async () => {
    show()
    const edit = screen.getByLabelText('Unsaved edit')
    edit.focus()
    fireEvent.change(edit, { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Accounts link'))
    await act(async () => { await Promise.resolve() })
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(edit)
    expect(document.title).toBe('Dashboard | MC Budget')
    expect(announcement().textContent).toBe('')
    expect(window.location.pathname).toBe('/dashboard')
  })

  it('waits for a delayed destination instead of focusing the loading fallback', async () => {
    const view = show({ delayed: true })
    const link = screen.getByText('Accounts link')
    link.focus()
    fireEvent.click(link)
    expect(document.activeElement).toBe(link)
    expect(announcement().textContent).toBe('')
    view.ready()
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Accounts heading' }))
      expect(announcement().textContent).toBe('Accounts page loaded.')
    })
  })

  it.each(['keydown', 'pointerdown', 'focusin'])('does not steal focus when the user interacts via %s during a delayed load', async event => {
    const view = show({ delayed: true })
    const link = screen.getByText('Accounts link')
    link.focus()
    fireEvent.click(link)
    if (event === 'keydown') fireEvent.keyDown(link, { key: 'Tab' })
    else if (event === 'pointerdown') fireEvent.pointerDown(link)
    else link.focus() // Already focused: explicitly dispatch focusin below.
    if (event === 'focusin') fireEvent.focusIn(link)
    view.ready()
    await waitFor(() => expect(announcement().textContent).toBe('Accounts page loaded.'))
    expect(document.activeElement).toBe(link)
  })

  it('handles Back/Forward page changes, but not same-page query history', async () => {
    show()
    fireEvent.click(screen.getByText('Accounts link'))
    fireEvent.click(screen.getByText('Transactions link'))
    await act(async () => window.history.back())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Accounts heading' })))
    expect(document.title).toBe('Accounts | MC Budget')
    await act(async () => window.history.forward())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Transactions heading' })))
    const filter = screen.getByLabelText('Filter')
    filter.focus()
    fireEvent.change(filter, { target: { value: 'one' } })
    fireEvent.change(filter, { target: { value: 'two' } })
    await act(async () => window.history.back())
    await waitFor(() => expect(window.location.search).toBe('?query=one'))
    expect(document.activeElement).toBe(filter)
  })

  it('does not compete with tutorial focus or release delayed route focus on Exit', async () => {
    const view = show()
    view.updateTutorial(true)
    const control = screen.getByRole('button', { name: 'Page action' })
    control.focus()
    fireEvent.click(screen.getByText('Accounts link'))
    await act(async () => { await Promise.resolve() })
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Accounts heading' }))
    expect(document.title).toBe('Accounts | MC Budget')
    expect(announcement().textContent).toBe('')
    view.updateTutorial(false)
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Accounts heading' }))
  })

  it('only annotates the visible main and cleans up owned attributes on unmount', () => {
    window.history.replaceState(null, '', '/dashboard')
    const value = tutorialContext()
    const { unmount } = render(<RouterProvider><TutorialContext.Provider value={value}><PageNavigation>
      <div style={{ display: 'none' }}><main>Old hidden page</main></div><main>Visible page</main>
    </PageNavigation></TutorialContext.Provider></RouterProvider>)
    const mains = [...document.querySelectorAll('main')]
    expect(mains[0].id).toBe('')
    expect(mains[1].id).toBe('main-content')
    unmount()
    expect(mains[1].id).toBe('')
  })

  it('closes transient mobile navigation when Skip is activated', async () => {
    show({ shell: true })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
      expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('true')
      fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }))
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Dashboard heading' })))
      expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false')
    } finally { Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView') }
  })

  it.each(['/budgeting', '/budgeting/annual-targets', '/budgeting/annual-overview', '/budgeting/recurring-expenses', '/settings/categories'])('exposes only the exact current sidebar page at %s', path => {
    show({ shell: true, initialPath: path })
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const links = within(nav).getAllByRole('link')
    expect(links.filter(link => link.getAttribute('aria-current') === 'page')).toHaveLength(1)
    expect(links.find(link => link.getAttribute('aria-current') === 'page')?.getAttribute('href')).toBe(path)
  })

  it('keeps budgeting-section and sidebar current-page semantics consistent', () => {
    show({ shell: true, initialPath: '/budgeting/annual-overview' })
    render(<RouterProvider><BudgetingSectionNav current="annual-overview" /></RouterProvider>)
    for (const name of ['Main navigation', 'Budgeting pages']) {
      const current = within(screen.getByRole('navigation', { name })).getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page')
      expect(current).toHaveLength(1)
      expect(current[0].getAttribute('href')).toBe('/budgeting/annual-overview')
    }
  })
})
