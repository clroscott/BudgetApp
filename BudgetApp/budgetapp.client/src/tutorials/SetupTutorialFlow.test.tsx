import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { AccountManagementPage } from '../pages/AccountManagementPage'
import { CategoryManagementPage } from '../pages/CategoryManagementPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAccounts, createAccount, updateAccount, setAccountActive, type AccountItem } from '../accounts/accountApi'
import { getCategories, createCategory, updateCategory, reorderCategories, setCategoryActive, type CategoryItem } from '../categories/categoryApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { setupTutorialGate } from './setupTutorialState'
import { deferred } from '../test/deferred'

vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), setAccountActive: vi.fn() }))
vi.mock('../categories/categoryApi', () => ({ getCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), reorderCategories: vi.fn(), setCategoryActive: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const account: AccountItem = { id: 'account-a', name: 'My account', type: 'Chequing', scope: 'Personal', ownerUserId: 'test-user', currency: 'CAD', institutionName: null, lastFourDigits: null, isActive: true }
const category: CategoryItem = { id: 'housing', name: 'Housing', type: 'Expense', displayOrder: 0, isActive: true, children: [] }
let accounts: AccountItem[], categories: CategoryItem[]
function Routes() {
  const { path } = useRouter(); const tutorials = useTutorials()
  return <>{path === '/accounts' ? <><AccountManagementPage /><AppLink to="/tutorials">Leave setup</AppLink></>
    : path === '/settings/categories' ? <CategoryManagementPage /> : <TutorialHubPage />}
    <output data-testid="step">{tutorials.activeTutorial ? tutorials.activeStepIndex : 'inactive'}</output>
  </>
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture()
  households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}>
    <TutorialProvider><Routes /></TutorialProvider>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Set up your finances tutorial controls' })
async function click(name: string) {
  const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(String(index))) }
async function start(section = 'Both') {
  const card = screen.getByRole('heading', { name: 'Set up your finances' }).closest('article')!
  const launch = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(launch.disabled).toBe(false)); fireEvent.click(launch); await step(0); await click(section)
}
async function chooseAccount(id = 'account-a') {
  const select = await screen.findByLabelText('Account for this tutorial') as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: id } })
  await click('Use this account'); await step(2); await click('Next'); await step(3)
}
function noWrites() { for (const command of [createAccount, updateAccount, setAccountActive, createCategory, updateCategory, reorderCategories, setCategoryActive]) expect(command).not.toHaveBeenCalled() }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); accounts = [structuredClone(account)]; categories = [structuredClone(category)]
  vi.mocked(getAccounts).mockImplementation(async () => structuredClone(accounts)); vi.mocked(getCategories).mockImplementation(async () => structuredClone(categories))
  vi.mocked(createAccount).mockImplementation(async (_hh, request) => { accounts.push({ ...account, ...request, id: 'created-account' }); return { id: 'created-account' } })
  vi.mocked(createCategory).mockImplementation(async (_hh, request) => {
    const saved = { ...category, id: request.parentCategoryId ? 'created-subcategory' : 'created-category', name: request.name }
    if (request.parentCategoryId) categories = categories.map(root => root.id === request.parentCategoryId ? { ...root, children: [...root.children, saved] } : root)
    else categories.push(saved)
    return { id: saved.id }
  })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Independent finance-setup sections', () => {
  it.each(['Owner', 'Viewer'] as const)('reviews existing %s setup without any required write and keeps both chapters reachable', async role => {
    show(role); await start(); await chooseAccount(); await click('Next'); await step(4)
    await click('Back'); await step(3); expect((await screen.findByLabelText('Account for this tutorial') as HTMLSelectElement).value).toBe('account-a')
    await click('Next'); await click('Next'); await step(5)
    if (role === 'Viewer') expect(screen.queryByRole('button', { name: 'Add category' })).toBeNull()
    await click('Next'); await step(6); await click('Continue with categories')
    expect(window.location.pathname).toBe('/settings/categories'); noWrites()
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('set-up-finances', 1, 'Completed', 6))
  })
  it.each(['Owner', 'Viewer'] as const)('adds a chosen account once as %s, with no automatic currency/scope change or category step', async role => {
    accounts = []; show(role); await start('Accounts'); await chooseAccount('new')
    const form = document.getElementById('setup-account-create') as HTMLFormElement
    fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'My savings' } })
    fireEvent.change(within(form).getByLabelText('Currency'), { target: { value: 'USD' } })
    expect(createAccount).not.toHaveBeenCalled(); fireEvent.submit(form)
    await click('Next'); await step(6); await click('Continue with accounts')
    expect(createAccount).toHaveBeenCalledExactlyOnceWith('household-a', expect.objectContaining({ name: 'My savings', currency: 'USD', scope: role === 'Viewer' ? 'Personal' : 'Household' }))
    expect(createCategory).not.toHaveBeenCalled(); expect(window.location.pathname).toBe('/accounts')
  })
  it('keeps an empty Viewer category review honest without exposing shared setup actions', async () => {
    categories = []; show('Viewer'); await start('Categories'); await step(4); await click('Next'); await step(5)
    expect(screen.getByRole('heading', { name: 'No categories to show' })).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Add category' })).toBeNull()
    await click('Next'); expect(within(guide()).getByText(/missing setup still needs attention/i)).toBeTruthy(); await click('Return to tutorials'); noWrites()
  })
  it('returns to a just-saved account from Categories without another create', async () => {
    accounts = []; show(); await start('Both'); await chooseAccount('new')
    const form = document.getElementById('setup-account-create')!
    fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Keep selected account' } }); fireEvent.submit(form)
    await click('Next'); await step(4); await click('Back'); await step(3)
    expect((await screen.findByLabelText('Account for this tutorial') as HTMLSelectElement).value).toBe('new')
    expect((screen.getByRole('button', { name: 'Add account' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Next'); await click('Next'); await click('Next'); await click('Continue with categories')
    expect(createAccount).toHaveBeenCalledOnce(); expect(createCategory).not.toHaveBeenCalled()
  })
  it('creates a needed category and subcategory only through explicit page actions', async () => {
    categories = []; show(); await start('Categories'); await click('Next'); await step(5)
    fireEvent.change(screen.getByLabelText('New root category'), { target: { value: 'Food' } }); expect(createCategory).not.toHaveBeenCalled()
    fireEvent.submit(document.getElementById('setup-category-create')!)
    const addChild = await screen.findByRole('button', { name: 'Add subcategory' }); fireEvent.click(addChild)
    fireEvent.change(screen.getByLabelText('New subcategory under Food'), { target: { value: 'Groceries' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await click('Next'); await step(6); await click('Continue with categories')
    expect(createCategory).toHaveBeenCalledTimes(2); expect(createCategory).toHaveBeenLastCalledWith('household-a', { name: 'Groceries', parentCategoryId: 'created-category' })
    expect(updateCategory).not.toHaveBeenCalled(); expect(reorderCategories).not.toHaveBeenCalled(); expect(setCategoryActive).not.toHaveBeenCalled()
  })
  it('requires a post-uncertainty account read and deliberate existing selection, not another Add', async () => {
    accounts = []; show(); await start('Accounts'); await chooseAccount('new')
    const form = document.getElementById('setup-account-create')!
    fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Saved despite lost reply' } })
    vi.mocked(createAccount).mockImplementationOnce(async (_hh, request) => { accounts.push({ ...account, ...request, id: 'lost-account' }); throw new Error('Lost reply') })
    fireEvent.submit(form); await screen.findByRole('button', { name: 'Check saved accounts' })
    expect((screen.getByLabelText('Account for this tutorial') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved accounts' })); await click('Back'); await click('Back'); await step(1)
    const select = screen.getByLabelText('Account for this tutorial') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false)); vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(select, { target: { value: 'lost-account' } }); await click('Use this account'); await click('Next'); await click('Next'); await click('Continue with accounts')
    expect(createAccount).toHaveBeenCalledOnce(); expect(updateAccount).not.toHaveBeenCalled()
  })
  it('requires a fresh saved-category list before clearing an uncertain draft, without repeating create', async () => {
    categories = []; show(); await start('Categories'); await click('Next')
    fireEvent.change(screen.getByLabelText('New root category'), { target: { value: 'Food' } })
    vi.mocked(createCategory).mockImplementationOnce(async () => { categories.push({ ...category, name: 'Food' }); throw new Error('Lost reply') })
    fireEvent.submit(document.getElementById('setup-category-create')!)
    const useList = await screen.findByRole('button', { name: 'Use the checked saved list' }) as HTMLButtonElement
    expect(useList.disabled).toBe(true); fireEvent.click(screen.getByRole('button', { name: 'Check saved categories' }))
    await waitFor(() => expect(useList.disabled).toBe(false)); vi.mocked(window.confirm).mockReturnValue(true); fireEvent.click(useList)
    await click('Next'); await click('Continue with categories'); expect(createCategory).toHaveBeenCalledOnce()
  })
  it('keeps failed reads distinct from empty setup and preserves dirty inputs on Escape', async () => {
    const pending = deferred<AccountItem[]>(); vi.mocked(getAccounts).mockReturnValueOnce(pending.promise)
    show(); const card = screen.getByRole('heading', { name: 'Set up your finances' }).closest('article')!
    const launch = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
    await waitFor(() => expect(launch.disabled).toBe(false)); fireEvent.click(launch); await step(0)
    await act(async () => pending.reject(new Error('Synthetic read unavailable')))
    expect(screen.queryByRole('heading', { name: 'No accounts to show' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    await click('Accounts'); await chooseAccount('new')
    const form = document.getElementById('setup-account-create')!
    fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Keep draft account' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); expect((within(form).getByLabelText('Account name') as HTMLInputElement).value).toBe('Keep draft account')
    fireEvent.click(screen.getByRole('link', { name: 'Leave setup' })); expect(window.confirm).toHaveBeenCalled(); expect(window.location.pathname).toBe('/accounts'); noWrites()
  })
  it('binds context/account and rejects dirty, stale, pending and uncertain outcomes', () => {
    const page = { page: 'accounts' as const, householdId: 'hh', fresh: true, busy: false, dirty: false, uncertain: false, selection: 'a', accountId: 'a' }
    const task = { householdId: 'hh', role: 'Viewer', section: 'accounts' as const, selection: 'a', accountId: 'a' }
    expect(setupTutorialGate(3, 'hh', 'Viewer', task, page).canNext).toBe(true)
    for (const changed of [{ fresh: false }, { busy: true }, { uncertain: true }, { dirty: true }, { selection: 'other' }, { accountId: null }])
      expect(setupTutorialGate(3, 'hh', 'Viewer', task, { ...page, ...changed }).canNext).toBe(false)
    expect(setupTutorialGate(3, 'hh', 'Owner', task, page).canNext).toBe(false)
    expect(setupTutorialGate(3, 'other', 'Viewer', task, page).canNext).toBe(false)
  })
})
