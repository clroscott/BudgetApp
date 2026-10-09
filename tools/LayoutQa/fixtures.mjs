// Fictional, browser-intercepted responses only. Never connect this QA harness
// to an application database or allow mutation requests through to a server.
export const user = { id: 'layout-user', email: 'layout@example.test', displayName: 'Layout QA user', emailConfirmed: true, loginVerificationEnabled: false }
export const household = { id: 'layout-household', name: 'Sample household', defaultCurrency: 'CAD', timeZoneId: 'America/Vancouver', role: 'Owner' }
const account = { id: 'layout-account', name: 'Sample chequing', type: 'Chequing', scope: 'Personal', ownerUserId: user.id, currency: 'CAD', institutionName: null, lastFourDigits: null, isActive: true }
const categories = [{ id: 'housing', name: 'Housing', type: 'Expense', displayOrder: 0, isActive: true, children: [] }]
export const importId = '11111111-1111-1111-1111-111111111111'
const importFile = { id: importId, originalFileName: 'sample-layout.xlsx', accountName: account.name, status: 'ReadyForReview', totalRows: 30, validRows: 30, invalidRows: 0, approvedRows: 0, excludedRows: 0, duplicateRows: 0, uploadedAtUtc: '2026-10-08T12:00:00Z', canEdit: true, sourceWorksheetName: 'Transactions' }
const drafts = Array.from({ length: 30 }, (_, index) => ({ id: `draft-${index}`, sourceRowNumber: index + 2, transactionDate: '2026-10-07', amount: 12.54 + index, description: `Sample purchase ${index + 1}`, importedCategoryName: null, importedSubcategoryName: null, selectedCategoryId: null, validationStatus: 'Valid', validationMessage: null, duplicateStatus: 'None', possibleMatchingTransactionId: null, reviewDecision: 'Pending', isDuplicateAcknowledged: false, includeInHouseholdBudget: false, includeInPersonalBudget: true, canChangePersonalInclusion: true, canChangeHouseholdInclusion: true, approvedTransactionId: null }))
const transactions = drafts.slice(0, 8).map(draft => ({ id: draft.id, accountId: account.id, accountName: account.name, currency: 'CAD', categoryId: null, categoryName: null, transactionDate: draft.transactionDate, postedDate: null, amount: draft.amount, description: draft.description, merchantName: null, notes: null, source: 'Import', reviewStatus: 'Reviewed', isExcludedFromBudget: false, isVoided: false, canEdit: true, includeInHouseholdBudget: false, includeInPersonalBudget: true, canEditHouseholdInclusion: true, updatedAtUtc: '2026-10-08T12:00:00Z' }))
const profile = { id: 'layout-profile', name: 'Standard sample', headers: ['Date', 'Description', 'Amount'], dateColumn: 'Date', descriptionColumn: 'Description', amountColumn: 'Amount', debitColumn: null, creditColumn: null, categoryColumn: null, subcategoryColumn: null, amountConvention: 'SpendingPositive', defaultAccountId: null, isActive: true, dateFormat: null, numberCulture: null }
const budgetCategories = Array.from({ length: 12 }, (_, index) => ({ id: `budget-category-${index}`, name: `Sample category ${index + 1}`, isActive: true, budgetedAmount: 100, actualAmount: 0, directActualAmount: 0, monthlyTargetAmount: null, averageMonthlyActualAmount: 0, lastMonthBudgetedAmount: null, lastMonthActualAmount: 0, children: [] }))

export function responseFor(path, { noHousehold = false, viewer = false, emptyBudget = false, multipleHouseholds = false, anonymous = false, administrator = false, owner = false, mfa = false } = {}) {
  const accountUser = { ...user, isApplicationAdministrator: administrator || owner, isApplicationOwner: owner, loginVerificationEnabled: mfa }
  if (path === '/api/auth/me') return anonymous ? null : accountUser
  if (path === '/api/auth/settings') return { user: accountUser, pendingEmailChange: null, version: 'layout-version' }
  if (path === '/api/households') return noHousehold ? [] : [
    { ...household, role: viewer ? 'Viewer' : household.role },
    ...(multipleHouseholds ? [{ ...household, id: 'other-layout-household', name: 'Another sample household with a longer name' }] : []),
  ]
  if (path === '/api/tutorial-progress') return []
  if (path.endsWith('/dashboard-layout')) return { preferredColumnCount: 3, visiblePanelKeys: ['financial-overview', 'needs-attention', 'quick-actions'], isDefault: false }
  if (path.endsWith('/dashboard-summary')) return { budget: { id: 'layout-budget', year: 2026, month: 10, scope: 'Household', currency: 'CAD', status: 'Draft', budgetedAmount: 1200, actualAmount: 0, remainingAmount: 1200, uncategorizedActualAmount: 0, currencyMismatchTransactionCount: 0 }, readyForReviewCount: 1, uncategorizedSpendingCount: 8, hasActiveAccount: true, hasVisibleTransactions: true, recent: null }
  if (/\/households\/[^/]+\/settings$/.test(path)) return { ...household, fiscalYearStartMonth: 1, version: 'layout-version', canEdit: !viewer, canChangeCurrency: false, currencyLockedReason: 'Financial data already exists.' }
  if (path.endsWith('/members')) return { canManageInvitations: !viewer, members: [{ userId: user.id, displayName: user.displayName, email: user.email, role: viewer ? 'Viewer' : 'Owner', status: 'Active', joinedAtUtc: null }], invitations: [], exitOptions: { canLeave: false, canDeleteUnused: false, blockedReason: 'Another owner must be assigned before leaving.' } }
  if (path.endsWith('/audit-events')) return { items: [{ id: 'layout-event', actorUserId: user.id, actorDisplayName: user.displayName, visibility: 'Household', occurredAtUtc: '2026-10-08T12:00:00Z', action: 'BudgetSaved', entityType: 'Budget', entityId: 'layout-budget', summary: 'Sample monthly budget saved', details: { Scope: 'Household' } }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1, filters: { actors: [{ userId: user.id, displayName: user.displayName }], actions: ['BudgetSaved'], entityTypes: ['Budget'] } }
  const supportAccount = { id: 'layout-support-account', displayName: 'Sample account', email: 'account@example.test', emailConfirmed: true, mfaEnabled: true, lockedUntilUtc: null, version: 'layout-account-version', isApplicationAdministrator: false, administratorRole: null, administratorVersion: null }
  if (path === '/api/admin/users') return { items: [supportAccount], totalCount: 1, page: 1, pageSize: 20 }
  if (path === '/api/admin/administrators') return { items: [{ ...supportAccount, id: user.id, displayName: user.displayName, email: user.email, isApplicationAdministrator: true, administratorRole: 'InstallationOwner', administratorVersion: 'layout-grant-version' }], totalCount: 1, page: 1, pageSize: 20 }
  if (path === '/api/admin/accounts/layout-support-account') return supportAccount
  if (path === '/api/admin/audit') return { items: [{ id: 'layout-operation', actorUserId: user.id, targetUserId: supportAccount.id, action: 'RevokeSessions', reason: 'Synthetic support test', outcome: 'Succeeded', occurredAtUtc: '2026-10-08T12:00:00Z' }], totalCount: 1, page: 1, pageSize: 20 }
  if (path.endsWith('/accounts')) return [account]
  if (path.endsWith('/categories')) return categories
  if (path.endsWith('/import-profiles')) return [profile]
  if (path.endsWith('/categorization-rules')) return [{ id: 'layout-rule', name: 'Sample housing rule', matchField: 'Description', matchOperator: 'Contains', matchValue: 'rent', accountId: null, targetCategoryId: 'housing', priority: 0, isActive: true }]
  if (path.endsWith('/transactions')) return { items: transactions, hasMore: false, page: 1, pageSize: 100, totalCount: transactions.length, totalPages: 1, totalsByCurrency: { CAD: transactions.reduce((sum, row) => sum + row.amount, 0) } }
  if (path.endsWith('/saved-filters') || path.endsWith('/transaction-filters')) return []
  if (path.endsWith('/imports')) return { items: [importFile], page: 1, pageSize: 25, totalCount: 1, totalPages: 1, totalVisibleCount: 1 }
  if (path.endsWith(`/imports/${importId}`)) return { ...importFile, currency: 'CAD', drafts }
  if (path.endsWith('/categorization-rule-application-preview')) return { fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0 }
  if (path.endsWith('/recurring-expenses')) return [{ id: 'layout-recurring', name: 'Sample rent', amount: 100, currency: 'CAD', scope: 'Household', ownerUserId: null, budgetMode: 'Overall', subcategoryId: 'housing', categoryName: 'Housing', subcategoryName: 'Rent', accountId: null, accountName: null, expectedDayOfMonth: 1, startsOn: '2026-01-01', endsOn: null, isActive: true }]
  if (/\/yearly-plans\/\d{4}$/.test(path)) return {
    id: 'layout-yearly-plan', fiscalYearStartYear: 2026, fiscalYearStartMonth: 1, householdDefaultFiscalYearStartMonth: 1, scope: 'Household', currency: 'CAD', startsOn: '2026-01-01', endsOn: '2026-12-31', updatedAtUtc: null,
    categories: budgetCategories.map(category => ({ ...category, annualTargetAmount: 1200, equivalentMonthlyAmount: 100 })),
  }
  if (/\/annual-budget-overview\/\d{4}$/.test(path)) return {
    year: 2026, scope: 'Household', currency: 'CAD', actualAverageMonthCount: 10, budgetedMonthCount: 1, annualBudgetedAmount: 1200, actualSpendingAmount: 0, remainingAmount: 1200, incomeAmount: 0, netCashFlowAmount: 0, uncategorizedSpendingAmount: 0, currencyMismatchTransactionCount: 0,
    months: Array.from({ length: 12 }, (_, index) => ({ budgetId: index === 9 ? 'layout-budget' : null, year: 2026, month: index + 1, status: index === 9 ? 'Draft' : null, budgetedAmount: index === 9 ? 1200 : null, actualSpendingAmount: 0, remainingAmount: index === 9 ? 1200 : null, incomeAmount: 0, netCashFlowAmount: 0 })),
    categories: budgetCategories.map(category => ({ ...category, remainingAmount: 100, averageActualPerMonth: 0 })),
  }
  if (path.endsWith('/budgets')) return []
  if (/\/budgets\/\d{4}\/\d{1,2}$/.test(path)) return {
    id: emptyBudget ? null : 'layout-budget', year: 2026, month: 10, scope: 'Household', currency: 'CAD', status: emptyBudget ? null : 'Draft', updatedAtUtc: null, uncategorizedActualAmount: 0, currencyMismatchTransactionCount: 0,
    categories: budgetCategories,
  }
  throw new Error(`Unmapped QA read: ${path}`)
}
