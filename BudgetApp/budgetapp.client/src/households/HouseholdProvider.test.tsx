import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { RouterProvider } from '../routing/RouterProvider'
import { authFixture, household, otherHousehold } from '../test/fixtures'
import { deferred } from '../test/deferred'
import { getHouseholds, createHousehold, type HouseholdMembership } from './householdApi'
import { HouseholdProvider } from './HouseholdProvider'
import { useHouseholds } from './useHouseholds'

vi.mock('./householdApi', async original => ({ ...await original<typeof import('./householdApi')>(),
  getHouseholds: vi.fn(), createHousehold: vi.fn(),
}))
function Probe() {
  const { households, currentHousehold, isLoading, initializationError, refresh, selectHousehold } = useHouseholds()
  const [draft, setDraft] = useState('Keep this edit')
  return <>
    <p>{isLoading ? 'Loading households' : 'Households ready'}</p>
    <p>Selected: {currentHousehold?.name ?? 'none'}</p>
    <p>Memberships: {households.map(item => item.name).join(', ') || 'none'}</p>
    <input aria-label="Unrelated household edit" value={draft} onChange={event => setDraft(event.target.value)} />
    <button onClick={() => void refresh()}>Refresh households</button>
    <button onClick={() => selectHousehold(otherHousehold.id)}>Select B</button>
    {initializationError && <p role="alert">{initializationError}</p>}
  </>
}
function tree(auth = authFixture()) {
  return <RouterProvider><AuthContext.Provider value={auth}><HouseholdProvider><Probe /></HouseholdProvider></AuthContext.Provider></RouterProvider>
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getHouseholds).mockReset().mockResolvedValue([household, otherHousehold])
  vi.mocked(createHousehold).mockResolvedValue(otherHousehold)
})
describe('household read ownership', () => {
  it('keeps the newest refresh, selection and unrelated edits when reads finish out of order', async () => {
    render(tree())
    await screen.findByText('Households ready')
    const first = deferred<HouseholdMembership[]>(), second = deferred<HouseholdMembership[]>()
    vi.mocked(getHouseholds).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    fireEvent.click(screen.getByText('Refresh households'))
    fireEvent.click(screen.getByText('Refresh households'))
    fireEvent.click(screen.getByText('Select B'))
    await act(async () => second.resolve([household, otherHousehold]))
    await act(async () => first.resolve([household]))
    expect(screen.getByText(`Selected: ${otherHousehold.name}`)).toBeTruthy()
    expect(localStorage.getItem('budgetapp.selected-household.test-user')).toBe(otherHousehold.id)
    expect((screen.getByLabelText('Unrelated household edit') as HTMLInputElement).value).toBe('Keep this edit')
  })
  it('hides former-user memberships immediately and ignores their late response', async () => {
    const view = render(tree())
    await screen.findByText('Households ready')
    const oldRead = deferred<HouseholdMembership[]>(), newRead = deferred<HouseholdMembership[]>()
    vi.mocked(getHouseholds).mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise)
    fireEvent.click(screen.getByText('Refresh households'))
    const auth = authFixture()
    auth.user = { ...auth.user!, id: 'next-user' }
    view.rerender(tree(auth))
    expect(screen.getByText('Memberships: none')).toBeTruthy()
    await act(async () => newRead.resolve([otherHousehold]))
    await act(async () => oldRead.resolve([household]))
    expect(screen.getByText(`Selected: ${otherHousehold.name}`)).toBeTruthy()
    expect(screen.getByText(`Memberships: ${otherHousehold.name}`)).toBeTruthy()
    expect(localStorage.getItem('budgetapp.selected-household.next-user')).toBe(otherHousehold.id)
  })
  it('does not restore memberships after logout or loss of confirmed-email access', async () => {
    const view = render(tree())
    await screen.findByText('Households ready')
    const read = deferred<HouseholdMembership[]>()
    vi.mocked(getHouseholds).mockReturnValueOnce(read.promise)
    fireEvent.click(screen.getByText('Refresh households'))
    const auth = authFixture()
    auth.user = { ...auth.user!, emailConfirmed: false }
    view.rerender(tree(auth))
    await act(async () => read.resolve([household]))
    expect(screen.getByText('Memberships: none')).toBeTruthy()
    expect(screen.getByText('Selected: none')).toBeTruthy()
    expect(localStorage.getItem('budgetapp.selected-household.test-user')).toBe(household.id)
  })
  it('distinguishes successful empty membership results from failed initial and retained refresh reads', async () => {
    vi.mocked(getHouseholds).mockRejectedValueOnce(new Error('Initial membership outage'))
    render(tree())
    await screen.findByText('Initial membership outage')
    expect(screen.getByText('Households ready')).toBeTruthy()
    fireEvent.click(screen.getByText('Refresh households'))
    await screen.findByText(`Selected: ${household.name}`)
    vi.mocked(getHouseholds).mockRejectedValueOnce(new Error('Refresh membership outage'))
    fireEvent.click(screen.getByText('Refresh households'))
    await screen.findByText('Refresh membership outage')
    expect(screen.getByText(`Selected: ${household.name}`)).toBeTruthy()
    vi.mocked(getHouseholds).mockResolvedValue([])
    fireEvent.click(screen.getByText('Refresh households'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await screen.findByText('Selected: none')
  })
})
