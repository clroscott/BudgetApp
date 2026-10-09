using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Transactions;

// Shared read predicate: dashboard counts/records must have precisely the same
// visibility and supported filter meanings as transaction-list drill-downs.
internal static class VisibleTransactionQuery
{
    public static IQueryable<VisibleTransactionRow> Create(
        BudgetAppDbContext dbContext, Guid householdId, Guid userId,
        Guid? accountId = null, DateOnly? fromDate = null, DateOnly? toDate = null,
        CategoryType? categoryType = null, Guid? categoryId = null,
        bool uncategorizedOnly = false, string? descriptionSearch = null,
        string? budgetInclusion = null, string? currency = null, bool spendingOnly = false) =>
        from transaction in dbContext.Transactions.AsNoTracking()
        join account in dbContext.Accounts.AsNoTracking() on transaction.AccountId equals account.Id
        join category in dbContext.Categories.AsNoTracking() on transaction.CategoryId equals category.Id into categories
        from category in categories.DefaultIfEmpty()
        where transaction.HouseholdId == householdId &&
              (account.Scope == AccountScope.Household || account.OwnerUserId == userId ||
               transaction.IncludeInHouseholdBudget == true && !transaction.IsExcludedFromBudget) &&
              (!accountId.HasValue || (account.Scope == AccountScope.Household || account.OwnerUserId == userId) && transaction.AccountId == accountId.Value) &&
              (currency == null || account.Currency == currency) &&
              (!spendingOnly || category != null && category.Type == CategoryType.Expense ||
               category == null && transaction.Amount > 0) &&
              (budgetInclusion == null ||
               !transaction.IsVoided && (
                budgetInclusion == "NotIncluded" &&
                 (transaction.IsExcludedFromBudget ||
                  !(transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household) &&
                  !transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) &&
                  !(transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Personal && account.OwnerUserId == userId)) ||
                !transaction.IsExcludedFromBudget &&
                 ((budgetInclusion == "Household" || budgetInclusion == "PersonalAndHousehold") &&
                   (transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household) &&
                   (budgetInclusion != "PersonalAndHousehold" || transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId)) ||
                  budgetInclusion == "Personal" &&
                   (transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) ||
                    transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Personal && account.OwnerUserId == userId)))) &&
              (!fromDate.HasValue || transaction.TransactionDate >= fromDate.Value) &&
              (!toDate.HasValue || transaction.TransactionDate <= toDate.Value) &&
              (!categoryType.HasValue || category != null && category.Type == categoryType.Value) &&
              (!categoryId.HasValue || transaction.CategoryId == categoryId.Value ||
               category != null && category.ParentCategoryId == categoryId.Value) &&
              (!uncategorizedOnly || !transaction.CategoryId.HasValue) &&
              (descriptionSearch == null || transaction.Description.ToUpper().Contains(descriptionSearch.ToUpper()))
        select new VisibleTransactionRow { Transaction = transaction, Account = account, Category = category };
}

internal sealed class VisibleTransactionRow
{
    public required Transaction Transaction { get; init; }
    public required Account Account { get; init; }
    public Category? Category { get; init; }
}
