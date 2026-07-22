using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Accounts;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Transactions;

internal sealed class TransactionRepository(BudgetAppDbContext dbContext)
    : ITransactionRepository
{
    public async Task<IReadOnlyList<TransactionRecord>> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        Guid? accountId,
        DateOnly? fromDate,
        DateOnly? toDate,
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
                  (!toDate.HasValue || transaction.TransactionDate <= toDate.Value)
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

        return await query.Take(take).ToListAsync(cancellationToken);
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
