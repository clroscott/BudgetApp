import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider } from '../routing/RouterProvider'
import { TutorialContext, type TutorialContextValue } from '../tutorials/tutorialContext'
import { TutorialHubPage } from './TutorialHubPage'

afterEach(cleanup)

function show(key: string, status: 'InProgress' | 'Completed' = 'InProgress') {
  const start = vi.fn(async () => {})
  const value: TutorialContextValue = {
    activeTutorial: null, activeStepIndex: 0, isLoading: false, error: null,
    start, dismiss: vi.fn(async () => {}), exit: vi.fn(async () => {}),
    next: vi.fn(async () => {}), back: vi.fn(async () => {}),
    progress: [{ tutorialKey: key, tutorialVersion: 1, status, currentStepIndex: 5,
      startedAtUtc: '2026-10-16', updatedAtUtc: '2026-10-16', completedAtUtc: null, dismissedAtUtc: null }],
  }
  render(<RouterProvider><TutorialContext.Provider value={value}><TutorialHubPage /></TutorialContext.Provider></RouterProvider>)
  const title = key === 'import-review' ? 'Import and review transactions' : 'Getting started'
  const card = screen.getByRole('heading', { name: title }).closest('article')!
  return { start, card: within(card) }
}

describe('tutorial launch labels', () => {
  it('calls an unfinished import guide Start again, not Resume', () => {
    const { card, start } = show('import-review')
    expect(card.queryByRole('button', { name: 'Resume tutorial' })).toBeNull()
    expect(card.getByText('Restarts the guide, not your saved work.')).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Start again' }))
    expect(start).toHaveBeenCalledExactlyOnceWith('import-review', false)
  })

  it('retains genuine resume for the navigation tour', () => {
    const { card, start } = show('getting-started')
    fireEvent.click(card.getByRole('button', { name: 'Resume tutorial' }))
    expect(start).toHaveBeenCalledExactlyOnceWith('getting-started', true)
  })

  it('also offers a fresh start for a resumable tutorial', () => {
    const { card, start } = show('getting-started')
    fireEvent.click(card.getByRole('button', { name: 'Start again' }))
    expect(start).toHaveBeenCalledExactlyOnceWith('getting-started', false)
  })

  it('keeps completed tutorials replayable from the beginning', () => {
    const { card, start } = show('import-review', 'Completed')
    fireEvent.click(card.getByRole('button', { name: 'Replay tutorial' }))
    expect(start).toHaveBeenCalledExactlyOnceWith('import-review', false)
  })
})
