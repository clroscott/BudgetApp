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
        CancellationToken cancellationToken)
    {
        var query =
            from transaction in dbContext.Transactions.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on transaction.AccountId equals account.Id
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id into categories
            from category in categories.DefaultIfEmpty()
            where transaction.HouseholdId == householdId &&
                  (account.Scope == AccountScope.Household || account.OwnerUserId == userId) &&
                  (!accountId.HasValue || transaction.AccountId == accountId.Value) &&
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
                account.Id,
                account.Name,
                account.Currency,
                transaction.CategoryId,
                category == null ? null : category.Name,
                transaction.TransactionDate,
                transaction.PostedDate,
                transaction.Amount,
                transaction.Description,
                transaction.MerchantName,
                transaction.Notes,
                transaction.Source.ToString(),
                transaction.ReviewStatus.ToString(),
                transaction.IsExcludedFromBudget,
                transaction.IsVoided,
                account.Scope == AccountScope.Personal,
                account.OwnerUserId);

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
                  (account.Scope == AccountScope.Household || account.OwnerUserId == userId) &&
                  (!criteria.AccountId.HasValue ||
                      transaction.AccountId == criteria.AccountId.Value) &&
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
                account.Name,
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
                transaction.Notes,
                transaction.IsExcludedFromBudget))
            .ToListAsync(cancellationToken);
    }

    public async Task<TransactionAccessRecord?> GetForUpdateAsync(
        Guid householdId,
        Guid transactionId,
        CancellationToken cancellationToken)
    {
        return await (
            from transaction in dbContext.Transactions
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
