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

export function responseFor(path, { noHousehold = false } = {}) {
  if (path === '/api/auth/me') return user
  if (path === '/api/auth/settings') return { user, pendingEmailChange: null, version: 'layout-version' }
  if (path === '/api/households') return noHousehold ? [] : [household]
  if (path === '/api/tutorial-progress') return []
  if (path.endsWith('/accounts')) return [account]
  if (path.endsWith('/categories')) return categories
  if (path.endsWith('/import-profiles')) return [profile]
  if (path.endsWith('/categorization-rules')) return [{ id: 'layout-rule', name: 'Sample housing rule', matchField: 'Description', matchOperator: 'Contains', matchValue: 'rent', accountId: null, targetCategoryId: 'housing', priority: 0, isActive: true }]
  if (path.endsWith('/transactions')) return { items: transactions, hasMore: false, page: 1, pageSize: 100, totalCount: transactions.length, totalPages: 1, totalsByCurrency: { CAD: transactions.reduce((sum, row) => sum + row.amount, 0) } }
  if (path.endsWith('/saved-filters') || path.endsWith('/transaction-filters')) return []
  if (path.endsWith('/imports')) return { items: [importFile], page: 1, pageSize: 25, totalCount: 1, totalPages: 1, totalVisibleCount: 1 }
  if (path.endsWith(`/imports/${importId}`)) return { ...importFile, currency: 'CAD', drafts }
  if (path.endsWith('/categorization-rule-application-preview')) return { fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0 }
  if (path.endsWith('/budgets')) return []
  if (/\/budgets\/\d{4}\/\d{1,2}$/.test(path)) return {
    id: 'layout-budget', year: 2026, month: 10, scope: 'Household', currency: 'CAD', status: 'Draft', updatedAtUtc: null, uncategorizedActualAmount: 0, currencyMismatchTransactionCount: 0,
    categories: Array.from({ length: 12 }, (_, index) => ({ id: `budget-category-${index}`, name: `Sample category ${index + 1}`, isActive: true, budgetedAmount: 100, actualAmount: 0, directActualAmount: 0, monthlyTargetAmount: null, averageMonthlyActualAmount: 0, lastMonthBudgetedAmount: null, lastMonthActualAmount: 0, children: [] })),
  }
  throw new Error(`Unmapped QA read: ${path}`)
}
