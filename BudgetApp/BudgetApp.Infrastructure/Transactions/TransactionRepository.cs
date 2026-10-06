using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Transactions;

internal sealed class TransactionRepository(BudgetAppDbContext dbContext)
    : ITransactionRepository
{
    public async Task<TransactionQueryResult> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        Guid? accountId,
        DateOnly? fromDate,
        DateOnly? toDate,
        CategoryType? categoryType,
        Guid? categoryId,
        bool uncategorizedOnly,
        string? descriptionSearch,
        int skip,
        int take,
        CancellationToken cancellationToken,
        string? budgetInclusion = null, string? currency = null, bool spendingOnly = false)
    {
        var query =
            from transaction in dbContext.Transactions.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on transaction.AccountId equals account.Id
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id into categories
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
                  (!categoryType.HasValue ||
                      (category != null && category.Type == categoryType.Value)) &&
                  (!categoryId.HasValue ||
                      transaction.CategoryId == categoryId.Value ||
                      (category != null && category.ParentCategoryId == categoryId.Value)) &&
                  (!uncategorizedOnly || !transaction.CategoryId.HasValue) &&
                  (descriptionSearch == null ||
                      transaction.Description.ToUpper().Contains(descriptionSearch.ToUpper()))
            orderby transaction.TransactionDate descending,
                transaction.Id descending
            select new TransactionRecord(
                transaction.Id,
                account.Scope == AccountScope.Personal && account.OwnerUserId != userId ? null : account.Id,
                account.Scope == AccountScope.Personal && account.OwnerUserId != userId ? "Shared expense (private account)" : account.Name,
                account.Currency,
                transaction.CategoryId,
                category == null ? null : category.Name,
                transaction.TransactionDate,
                account.Scope == AccountScope.Personal && account.OwnerUserId != userId ? null : transaction.PostedDate,
                transaction.Amount,
                transaction.Description,
                account.Scope == AccountScope.Personal && account.OwnerUserId != userId ? null : transaction.MerchantName,
                account.Scope == AccountScope.Personal && account.OwnerUserId != userId ? null : transaction.Notes,
                transaction.Source.ToString(),
                transaction.ReviewStatus.ToString(),
                transaction.IsExcludedFromBudget ||
                    !(transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household) &&
                    !transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) &&
                    !(transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Personal && account.OwnerUserId == userId),
                transaction.IsVoided,
                account.Scope == AccountScope.Personal,
                account.OwnerUserId,
                !transaction.IsExcludedFromBudget && (transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household),
                !transaction.IsExcludedFromBudget && (transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) ||
                    transaction.IncludeInHouseholdBudget == null && account.OwnerUserId == userId && account.Scope == AccountScope.Personal),
                transaction.UpdatedAtUtc);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);
        return new TransactionQueryResult(items, totalCount);
    }

    public async Task<IReadOnlyList<TransactionExportRecord>> ListVisibleForExportAsync(
        Guid householdId,
        Guid userId,
        TransactionSearchCriteria criteria,
        CancellationToken cancellationToken)
    {
        return await (
            from transaction in dbContext.Transactions.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on transaction.AccountId equals account.Id
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id into categories
            from category in categories.DefaultIfEmpty()
            join parentCategory in dbContext.Categories.AsNoTracking()
                on category.ParentCategoryId equals parentCategory.Id into parentCategories
            from parentCategory in parentCategories.DefaultIfEmpty()
            where transaction.HouseholdId == householdId &&
                  (account.Scope == AccountScope.Household || account.OwnerUserId == userId ||
                   transaction.IncludeInHouseholdBudget == true && !transaction.IsExcludedFromBudget) &&
                  (!criteria.AccountId.HasValue ||
                      (account.Scope == AccountScope.Household || account.OwnerUserId == userId) && transaction.AccountId == criteria.AccountId.Value) &&
                  (criteria.Currency == null || account.Currency == criteria.Currency) &&
                  (!criteria.SpendingOnly || category != null && category.Type == CategoryType.Expense ||
                   category == null && transaction.Amount > 0) &&
                  (criteria.BudgetInclusion == null ||
                   !transaction.IsVoided && (
                    criteria.BudgetInclusion == "NotIncluded" &&
                     (transaction.IsExcludedFromBudget ||
                      !(transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household) &&
                      !transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) &&
                      !(transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Personal && account.OwnerUserId == userId)) ||
                    !transaction.IsExcludedFromBudget &&
                     ((criteria.BudgetInclusion == "Household" || criteria.BudgetInclusion == "PersonalAndHousehold") &&
                       (transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household) &&
                       (criteria.BudgetInclusion != "PersonalAndHousehold" || transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId)) ||
                      criteria.BudgetInclusion == "Personal" &&
                       (transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) ||
                        transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Personal && account.OwnerUserId == userId)))) &&
                  (!criteria.FromDate.HasValue ||
                      transaction.TransactionDate >= criteria.FromDate.Value) &&
                  (!criteria.ToDate.HasValue ||
                      transaction.TransactionDate <= criteria.ToDate.Value) &&
                  (!criteria.CategoryType.HasValue ||
                      (category != null && category.Type == criteria.CategoryType.Value)) &&
                  (!criteria.CategoryId.HasValue ||
                      transaction.CategoryId == criteria.CategoryId.Value ||
                      (category != null &&
                          category.ParentCategoryId == criteria.CategoryId.Value)) &&
                  (!criteria.UncategorizedOnly || !transaction.CategoryId.HasValue) &&
                  (criteria.DescriptionSearch == null ||
                      transaction.Description.ToUpper()
                          .Contains(criteria.DescriptionSearch.ToUpper()))
            orderby transaction.TransactionDate,
                transaction.Id
            select new TransactionExportRecord(
                account.Scope == AccountScope.Personal && account.OwnerUserId != userId ? "Shared expense (private account)" : account.Name,
                account.Currency,
                category == null
                    ? null
                    : category.ParentCategoryId.HasValue
                        ? parentCategory!.Name
                        : category.Name,
                category != null && category.ParentCategoryId.HasValue
                    ? category.Name
                    : null,
                transaction.TransactionDate,
                transaction.Amount,
                transaction.Description,
                account.Scope == AccountScope.Personal && account.OwnerUserId != userId ? null : transaction.Notes,
                transaction.IsExcludedFromBudget ||
                    !(transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household) &&
                    !transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) &&
                    !(transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Personal && account.OwnerUserId == userId),
                !transaction.IsExcludedFromBudget && (transaction.IncludeInHouseholdBudget ?? account.Scope == AccountScope.Household),
                !transaction.IsExcludedFromBudget && (transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) ||
                    transaction.IncludeInHouseholdBudget == null && account.OwnerUserId == userId && account.Scope == AccountScope.Personal)))
            .ToListAsync(cancellationToken);
    }

    public async Task<TransactionAccessRecord?> GetForUpdateAsync(
        Guid householdId,
        Guid transactionId,
        CancellationToken cancellationToken)
    {
        return await (
            from transaction in dbContext.Transactions.Include(item => item.PersonalBudgetInclusions)
            join account in dbContext.Accounts
                on transaction.AccountId equals account.Id
            where transaction.HouseholdId == householdId && transaction.Id == transactionId
            select new TransactionAccessRecord(
                transaction,
                account.Scope == AccountScope.Personal,
                account.OwnerUserId))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
