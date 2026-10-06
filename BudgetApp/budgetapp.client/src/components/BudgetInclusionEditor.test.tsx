import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider } from '../routing/RouterProvider'
import { AppLink } from '../routing/AppLink'
import { updateBudgetInclusion, type TransactionItem } from '../transactions/transactionApi'
import { BudgetInclusionEditor } from './BudgetInclusionEditor'

vi.mock('../transactions/transactionApi', async original => ({
  ...await original<typeof import('../transactions/transactionApi')>(), updateBudgetInclusion: vi.fn(),
}))
const row: TransactionItem = {
  id: 'rent', accountId: 'private-account', accountName: 'My account', currency: 'CAD',
  categoryId: 'housing', categoryName: 'Housing', transactionDate: '2026-07-01', postedDate: null,
  amount: 1200, description: 'Rent', merchantName: null, notes: null, source: 'Manual',
  reviewStatus: 'Reviewed', isExcludedFromBudget: false, isVoided: false, canEdit: true,
  includeInHouseholdBudget: false, includeInPersonalBudget: true, canEditHouseholdInclusion: true,
  updatedAtUtc: '2026-07-01T00:00:00Z',
}
function show(transaction = row, onSaved = vi.fn().mockResolvedValue(undefined)) {
  const tree = (value: TransactionItem) => <RouterProvider>
    <BudgetInclusionEditor householdId="household" transaction={value} onSaved={onSaved} />
    <AppLink to="/dashboard">Leave</AppLink>
  </RouterProvider>
  const result = render(tree(transaction))
  fireEvent.click(screen.getByText('Include in budgets'))
  return { ...result, onSaved, update: (value: TransactionItem) => result.rerender(tree(value)) }
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(updateBudgetInclusion).mockResolvedValue(undefined) })

describe('transaction budget inclusion', () => {
  it('saves one transaction with both selections and its version', async () => {
    const { onSaved } = show()
    fireEvent.click(screen.getByLabelText('Household budget'))
    fireEvent.click(screen.getByRole('button', { name: 'Save budget inclusion' }))
    await screen.findByText('Budget inclusion saved.')
    expect(updateBudgetInclusion).toHaveBeenCalledWith('household', 'rent', {
      includeInHouseholdBudget: true, includeInPersonalBudget: true, updatedAtUtc: row.updatedAtUtc,
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect((screen.getByRole('button', { name: 'Save budget inclusion' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText('Leave'))
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('failed saves preserve choices and navigation protection', async () => {
    vi.mocked(updateBudgetInclusion).mockRejectedValueOnce(new Error('Changed elsewhere'))
    show()
    fireEvent.click(screen.getByLabelText('Household budget'))
    fireEvent.click(screen.getByRole('button', { name: 'Save budget inclusion' }))
    await screen.findByText('Changed elsewhere')
    fireEvent.click(screen.getByText('Leave'))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('Household budget') as HTMLInputElement).checked).toBe(true)
  })
  it('a shared private expense permits only the current user’s Personal choice', async () => {
    show({ ...row, accountId: null, canEdit: false, canEditHouseholdInclusion: false,
      includeInPersonalBudget: false, includeInHouseholdBudget: true })
    expect((screen.getByLabelText('Household budget') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('My personal budget'))
    fireEvent.click(screen.getByRole('button', { name: 'Save budget inclusion' }))
    await waitFor(() => expect(updateBudgetInclusion).toHaveBeenCalledWith('household', 'rent', {
      includeInHouseholdBudget: undefined, includeInPersonalBudget: true, updatedAtUtc: row.updatedAtUtc,
    }))
  })
  it('incoming updates never silently overwrite dirty choices or their original version', async () => {
    const { update } = show()
    fireEvent.click(screen.getByLabelText('Household budget'))
    update({ ...row, updatedAtUtc: '2026-07-02T00:00:00Z', includeInPersonalBudget: false })
    expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save budget inclusion' }))
    await waitFor(() => expect(updateBudgetInclusion).toHaveBeenCalledWith('household', 'rent',
      expect.objectContaining({ updatedAtUtc: row.updatedAtUtc })))
  })
  it('reset requires confirmation and returns to the latest saved version', async () => {
    const { update } = show()
    fireEvent.click(screen.getByLabelText('Household budget'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect((screen.getByLabelText('Household budget') as HTMLInputElement).checked).toBe(true)
    update({ ...row, updatedAtUtc: '2026-07-02T00:00:00Z', includeInPersonalBudget: false })
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect((screen.getByLabelText('Household budget') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText('My personal budget') as HTMLInputElement).checked).toBe(false)
  })
})
