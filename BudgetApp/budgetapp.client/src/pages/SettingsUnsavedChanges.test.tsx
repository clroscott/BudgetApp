import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdContext } from '../households/householdContext'
import { HouseholdForm } from '../households/HouseholdForm'
import { AppLink } from '../routing/AppLink'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { householdsFixture } from '../test/fixtures'
import { getAccounts, createAccount } from '../accounts/accountApi'
import { getCategories } from '../categories/categoryApi'
import { getCategorizationRules } from '../categorizationRules/categorizationRuleApi'
import { getImportProfiles } from '../imports/importProfileApi'
import { getRecurringExpenses } from '../recurringExpenses/recurringExpenseApi'
import { getHouseholdMembers } from '../households/householdInvitationApi'
import { AccountManagementPage } from './AccountManagementPage'
import { CategoryManagementPage } from './CategoryManagementPage'
import { CategorizationRuleManagementPage } from './CategorizationRuleManagementPage'
import { ImportProfileManagementPage } from './ImportProfileManagementPage'
import { RecurringExpenseManagementPage } from './RecurringExpenseManagementPage'
import { HouseholdManagementPage } from './HouseholdManagementPage'

vi.mock('../accounts/accountApi', async original => ({
  ...await original<typeof import('../accounts/accountApi')>(), getAccounts: vi.fn(), createAccount: vi.fn(),
}))
vi.mock('../categories/categoryApi', async original => ({
  ...await original<typeof import('../categories/categoryApi')>(), getCategories: vi.fn(),
}))
vi.mock('../categorizationRules/categorizationRuleApi', async original => ({
  ...await original<typeof import('../categorizationRules/categorizationRuleApi')>(), getCategorizationRules: vi.fn(),
}))
vi.mock('../imports/importProfileApi', async original => ({
  ...await original<typeof import('../imports/importProfileApi')>(), getImportProfiles: vi.fn(),
}))
vi.mock('../recurringExpenses/recurringExpenseApi', async original => ({
  ...await original<typeof import('../recurringExpenses/recurringExpenseApi')>(), getRecurringExpenses: vi.fn(),
}))
vi.mock('../households/householdInvitationApi', async original => ({
  ...await original<typeof import('../households/householdInvitationApi')>(), getHouseholdMembers: vi.fn(),
}))

function Routes({ children }: { children: ReactNode }) {
  const { path } = useRouter()
  return path === '/dashboard' ? <p>Destination</p> : <>{children}<AppLink to="/dashboard">Leave page</AppLink></>
}
function show(page: ReactNode) {
  window.history.replaceState(null, '', '/settings-test')
  return render(<RouterProvider><HouseholdContext.Provider value={householdsFixture()}>
    <Routes>{page}</Routes>
  </HouseholdContext.Provider></RouterProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAccounts).mockResolvedValue([])
  vi.mocked(getCategories).mockResolvedValue([{ id: 'housing', name: 'Housing',
    type: 'Expense', displayOrder: 0, isActive: true, children: [] }])
  vi.mocked(getCategorizationRules).mockResolvedValue([])
  vi.mocked(getImportProfiles).mockResolvedValue([])
  vi.mocked(getRecurringExpenses).mockResolvedValue([])
  vi.mocked(getHouseholdMembers).mockResolvedValue({
    canManageInvitations: true, members: [], invitations: [],
    exitOptions: { canLeave: false, canDeleteUnused: false, blockedReason: 'Sample fixture' },
  })
  vi.mocked(createAccount).mockResolvedValue({ id: 'created-account' })
})

const cases = [
  { name: 'new financial account', page: <AccountManagementPage />, selector: 'form input[name="name"]' },
  { name: 'new category', page: <CategoryManagementPage />, selector: '#new-category-name' },
  { name: 'categorization rule', page: <CategorizationRuleManagementPage />, selector: '.rule-form input' },
  { name: 'CSV profile', page: <ImportProfileManagementPage />, selector: '.import-profile-form input' },
  { name: 'recurring expense', page: <RecurringExpenseManagementPage />, selector: '.recurring-form input' },
  { name: 'household invitation', page: <HouseholdManagementPage />, selector: 'input[name="email"]' },
  { name: 'household creation', page: <HouseholdForm isSubmitting={false} onSubmit={vi.fn(async () => {})} />, selector: '#household-name' },
]

describe('editable page guard coverage', () => {
  it('preserves saved regional profile formats in the editor and protects changes to them', async () => {
    vi.mocked(getImportProfiles).mockResolvedValue([{
      id: 'profile-a', name: 'Regional bank', headers: ['Date', 'Description', 'Amount'],
      dateColumn: 'Date', descriptionColumn: 'Description', amountColumn: 'Amount', debitColumn: null, creditColumn: null,
      categoryColumn: null, subcategoryColumn: null, amountConvention: 'SpendingPositive', defaultAccountId: null, isActive: true,
      dateFormat: 'dd/MM/yyyy', numberCulture: 'de-DE',
    }])
    show(<ImportProfileManagementPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const date = screen.getByLabelText('Text date format') as HTMLSelectElement
    const number = screen.getByLabelText('Text number format') as HTMLSelectElement
    expect(date.value).toBe('dd/MM/yyyy')
    expect(number.value).toBe('de-DE')
    fireEvent.change(number, { target: { value: 'fr-CA' } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(number.value).toBe('fr-CA')
    expect(window.location.pathname).toBe('/settings-test')
  })
  it.each(cases)('protects $name and becomes clean again when the value is restored', async ({ page, selector }) => {
    const { container } = show(page)
    const input = await waitFor(() => {
      const found = container.querySelector<HTMLInputElement>(selector)
      expect(found).not.toBeNull()
      return found!
    })
    const initial = input.value
    const untouched = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(untouched)
    expect(untouched.defaultPrevented).toBe(false)
    fireEvent.change(input, { target: { value: 'sample@example.test' } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/settings-test')
    expect(input.value).toBe('sample@example.test')
    fireEvent.change(input, { target: { value: initial } })
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Destination')).toBeTruthy()
  })
  it('keeps native create-form values after failure and clears protection after success', async () => {
    const { container } = show(<AccountManagementPage />)
    const input = container.querySelector('form input[name="name"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Sample chequing' } })
    const form = input.closest('form')!
    vi.mocked(createAccount).mockRejectedValueOnce(new Error('Sample create failure'))
    fireEvent.submit(form)
    await screen.findByText('Sample create failure')
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('Sample chequing')
    fireEvent.submit(form)
    await waitFor(() => expect(input.value).toBe(''))
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
  it('preserves an inline rename when Cancel is rejected', async () => {
    show(<CategoryManagementPage />)
    const renameButton = await screen.findByRole('button', { name: 'Rename' })
    fireEvent.click(renameButton)
    const input = screen.getByLabelText('Rename Housing') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New housing name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(input.value).toBe('New housing name')
    expect(window.confirm).toHaveBeenCalledTimes(1)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Rename Housing')).toBeNull()
    fireEvent.click(screen.getByText('Leave page'))
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })
})
