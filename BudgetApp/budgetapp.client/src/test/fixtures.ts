import { vi } from 'vitest'
import type { AuthContextValue } from '../auth/authContext'
import type { HouseholdContextValue } from '../households/householdContext'
import type { HouseholdMembership } from '../households/householdApi'
import type { BudgetPageData } from '../budgets/budgetApi'
import type { YearlyPlanData } from '../budgets/yearlyPlanApi'

export const household: HouseholdMembership = {
  id: 'household-a', name: 'Sample household A', defaultCurrency: 'CAD',
  timeZoneId: 'America/Vancouver', role: 'Owner',
}
export const otherHousehold: HouseholdMembership = { ...household, id: 'household-b', name: 'Sample household B' }
export function householdsFixture(): HouseholdContextValue {
  return {
    currentHousehold: household, households: [household, otherHousehold], isLoading: false,
    initializationError: null, selectHousehold: vi.fn(() => true),
    updateHousehold: vi.fn(),
    refresh: vi.fn(async () => {}), createHousehold: vi.fn(async () => household),
  }
}
export function authFixture(): AuthContextValue {
  const user = { id: 'test-user', email: 'sample@example.test', displayName: 'Sample user', emailConfirmed: true }
  return {
    user, isLoading: false, initializationError: null,
    login: vi.fn(async () => user), register: vi.fn(async () => ({ message: 'Check your email.' })),
    updateUser: vi.fn(),
    logout: vi.fn(async () => {}), refresh: vi.fn(async () => {}),
  }
}
export function budgetFixture(): BudgetPageData {
  return {
    id: 'budget-a', year: 2026, month: 1, scope: 'Household', currency: 'CAD',
    status: 'Draft', updatedAtUtc: null, uncategorizedActualAmount: 0,
    currencyMismatchTransactionCount: 0,
    categories: [{
      id: 'housing', name: 'Housing', isActive: true, budgetedAmount: 100,
      actualAmount: 0, directActualAmount: 0, monthlyTargetAmount: null,
      averageMonthlyActualAmount: 0, lastMonthBudgetedAmount: null,
      lastMonthActualAmount: 0, children: [],
    }],
  }
}
export function annualFixture(): YearlyPlanData {
  return {
    id: 'annual-a', fiscalYearStartYear: 2026, fiscalYearStartMonth: 1,
    householdDefaultFiscalYearStartMonth: 1, scope: 'Household', currency: 'CAD',
    startsOn: '2026-01-01', endsOn: '2026-12-31', updatedAtUtc: null,
    categories: [{ id: 'housing', name: 'Housing', isActive: true,
      annualTargetAmount: 1200, equivalentMonthlyAmount: 100, children: [] }],
  }
}
