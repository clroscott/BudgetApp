import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { AppShell } from '../components/AppShell'
import { RouterProvider } from '../routing/RouterProvider'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { authFixture, household, otherHousehold } from '../test/fixtures'
import { getHouseholds } from './householdApi'
import { HouseholdProvider } from './HouseholdProvider'
import { useHouseholds } from './useHouseholds'

vi.mock('./householdApi', async importOriginal => ({
  ...await importOriginal<typeof import('./householdApi')>(), getHouseholds: vi.fn(),
}))

function Editor() {
  const [value, setValue] = useState('original')
  const { currentHousehold, selectHousehold } = useHouseholds()
  useUnsavedChangesGuard(value !== 'original', 'Discard unsaved sample edits?')
  return <>
    <input aria-label="Sample edit" value={value} onChange={e => setValue(e.target.value)} />
    <button onClick={() => selectHousehold(otherHousehold.id)}>Switch from page</button>
    <button onClick={() => selectHousehold(currentHousehold!.id)}>Select current household</button>
  </>
}
function View() {
  const { currentHousehold, isLoading } = useHouseholds()
  if (isLoading || !currentHousehold) return <p>Loading fixtures</p>
  return <AppShell key={currentHousehold.id}><Editor /></AppShell>
}
function show() {
  const auth = authFixture()
  render(<RouterProvider><AuthContext.Provider value={auth}>
    <HouseholdProvider><View /></HouseholdProvider>
  </AuthContext.Provider></RouterProvider>)
  return auth
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getHouseholds).mockResolvedValue([household, otherHousehold])
})

describe('household switching and sign-out', () => {
  it('canceling header switching preserves household, storage, selector, and form', async () => {
    show()
    const selector = await screen.findByLabelText('Current household') as HTMLSelectElement
    const input = screen.getByLabelText('Sample edit') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'changed' } })
    fireEvent.change(selector, { target: { value: otherHousehold.id } })
    expect(selector.value).toBe(household.id)
    expect(localStorage.getItem('budgetapp.selected-household.test-user')).toBe(household.id)
    expect(input.value).toBe('changed')
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
  it('approved switching prompts once, persists context, and then remounts the page', async () => {
    show()
    const selector = await screen.findByLabelText('Current household')
    fireEvent.change(screen.getByLabelText('Sample edit'), { target: { value: 'changed' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(selector, { target: { value: otherHousehold.id } })
    expect((screen.getByLabelText('Current household') as HTMLSelectElement).value).toBe(otherHousehold.id)
    expect(localStorage.getItem('budgetapp.selected-household.test-user')).toBe(otherHousehold.id)
    expect((screen.getByLabelText('Sample edit') as HTMLInputElement).value).toBe('original')
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
  it('guards switches initiated elsewhere, but not a same-household or clean switch', async () => {
    show()
    await screen.findByLabelText('Current household')
    fireEvent.change(screen.getByLabelText('Sample edit'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByText('Select current household'))
    expect(window.confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Switch from page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Current household') as HTMLSelectElement).value).toBe(household.id)
    fireEvent.change(screen.getByLabelText('Sample edit'), { target: { value: 'original' } })
    fireEvent.click(screen.getByText('Switch from page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Current household') as HTMLSelectElement).value).toBe(otherHousehold.id)
  })
  it('canceling sign-out never calls logout; approving sign-out asks only once', async () => {
    const auth = show()
    await screen.findByLabelText('Current household')
    fireEvent.change(screen.getByLabelText('Sample edit'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByText('Sign out'))
    expect(auth.logout).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Sample edit') as HTMLInputElement).value).toBe('changed')
    vi.mocked(window.confirm).mockClear().mockReturnValue(true)
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(auth.logout).toHaveBeenCalledTimes(1)
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
  it('failed sign-out retains dirty protection and the current household', async () => {
    const auth = show()
    vi.mocked(auth.logout).mockRejectedValue(new Error('Sample logout failure'))
    await screen.findByLabelText('Current household')
    fireEvent.change(screen.getByLabelText('Sample edit'), { target: { value: 'changed' } })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByText('Sign out'))
    await screen.findByText('Sample logout failure')
    vi.mocked(window.confirm).mockClear().mockReturnValue(false)
    fireEvent.click(screen.getByText('Switch from page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Current household') as HTMLSelectElement).value).toBe(household.id)
    expect((screen.getByLabelText('Sample edit') as HTMLInputElement).value).toBe('changed')
  })
})
