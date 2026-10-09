import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { ContextualHelp } from '../components/ContextualHelp'
import { helpTopics, helpTopicUrl, requestedHelpTopic } from '../help/helpTopics'
import { HouseholdContext } from '../households/householdContext'
import { PageNavigation } from '../routing/PageNavigation'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { authFixture, householdsFixture } from '../test/fixtures'
import { TutorialContext } from '../tutorials/tutorialContext'
import { HelpPage } from './HelpPage'

function show(path = '/help', auth = authFixture(), households = householdsFixture()) {
  window.history.replaceState(null, '', path)
  const tutorial = { activeTutorial: null, activeStepIndex: 0, progress: [], isLoading: false, error: null,
    start: vi.fn(async () => {}), dismiss: vi.fn(async () => {}), exit: vi.fn(async () => {}),
    next: vi.fn(async () => {}), back: vi.fn(async () => {}) }
  function Routes() {
    const { path: route } = useRouter()
    return route === '/help' ? <HelpPage /> : <main><h1>Source page</h1><ContextualHelp topic="scope-privacy" /></main>
  }
  return { auth, tutorial, ...render(<RouterProvider><AuthContext.Provider value={auth}>
    <HouseholdContext.Provider value={households}><TutorialContext.Provider value={tutorial}>
      <PageNavigation><Routes /></PageNavigation>
    </TutorialContext.Provider></HouseholdContext.Provider>
  </AuthContext.Provider></RouterProvider>) }
}

describe('read-only help page', () => {
  it('offers all five topics with consistent current-page state and a meaningful title', () => {
    show()
    const nav = screen.getByRole('navigation', { name: 'Help topics' })
    expect(within(nav).getAllByRole('link')).toHaveLength(6)
    expect(within(nav).getByRole('link', { name: 'All help topics' }).getAttribute('aria-current')).toBe('page')
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(sidebar).getByRole('link', { name: 'Help' }).getAttribute('aria-current')).toBe('page')
    expect(document.title).toBe('Help | MC Budget')
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy()
  })
  it.each(helpTopics)('opens the exact topic from a direct/deep link to $id', topic => {
    show(helpTopicUrl(topic.id))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(topic.title)
    expect(screen.getByRole('article', { name: topic.title })).toBeTruthy()
    expect(screen.getByText(topic.summary)).toBeTruthy()
    for (const section of topic.sections) expect(screen.getByRole('heading', { name: section.title })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Help topics' })
    expect(within(nav).getByRole('link', { name: topic.title }).getAttribute('aria-current')).toBe('page')
  })
  it('uses normal guarded navigation and focuses the topic heading after entering from inline help', async () => {
    show('/source')
    fireEvent.click(screen.getByText('About scope and privacy'))
    fireEvent.click(screen.getByRole('link', { name: 'Read more: Scope and privacy' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Scope and privacy' })))
    expect(window.location.hash).toBe('#scope-privacy')
    expect(document.querySelector('.page-announcement')?.textContent).toBe('Help page loaded.')
  })
  it('switches help topics accessibly and honors browser Back and Forward without writes or tutorial changes', async () => {
    const fetch = vi.spyOn(window, 'fetch')
    const { tutorial, auth } = show('/help#scope-privacy')
    const nav = screen.getByRole('navigation', { name: 'Help topics' })
    fireEvent.click(within(nav).getByRole('link', { name: 'Monthly budget states' }))
    expect(window.location.hash).toBe('#budget-states')
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Monthly budget states' }))
    await act(async () => { window.history.back() })
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Scope and privacy'))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Scope and privacy' }))
    await act(async () => { window.history.forward() })
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Monthly budget states'))
    fireEvent.click(within(nav).getByRole('link', { name: 'All help topics' }))
    expect(window.location.hash).toBe('')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Help')
    expect(fetch).not.toHaveBeenCalled()
    expect(tutorial.start).not.toHaveBeenCalled()
    expect(tutorial.dismiss).not.toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(auth.logout).not.toHaveBeenCalled()
  })
  it.each(['anonymous', 'unverified', 'no-household'] as const)('works for %s users without household navigation or data reads', mode => {
    const fetch = vi.spyOn(window, 'fetch')
    const auth = authFixture()
    if (mode === 'anonymous') auth.user = null
    if (mode === 'unverified') auth.user = { ...auth.user!, emailConfirmed: false }
    const households = householdsFixture()
    households.currentHousehold = null
    households.households = []
    households.isLoading = true
    households.initializationError = 'Unavailable household service'
    show('/help#import-approval', auth, households)
    expect(screen.getByRole('heading', { level: 1, name: 'Import review and approval' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Browse tutorials' })).toBeNull()
    const returnLink = screen.getByRole('link', { name: mode === 'anonymous' ? 'Return to sign in' : mode === 'unverified' ? 'Return to confirmation' : 'Return to household setup' })
    expect(returnLink.closest('.page-title-row')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('handles unknown/malformed topic IDs with a safe browse fallback instead of rendering URL HTML', () => {
    show('/help#%3Cimg%20src=x%20onerror=alert(1)%3E')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Help')
    expect(screen.getByText('That help topic could not be found. Choose a topic below.').getAttribute('role')).toBe('status')
    expect(document.querySelector('[onerror]')).toBeNull()
    expect(requestedHelpTopic('#toString')).toBeUndefined()
  })
})
