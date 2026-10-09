using BudgetApp.Application.Dashboards;
using BudgetApp.Domain.Accounts;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Transactions;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Dashboards;

internal sealed class DashboardSummaryRepository(BudgetAppDbContext dbContext) : IDashboardSummaryRepository
{
    public async Task<DashboardActivityRecord> GetActivityAsync(
        Guid householdId, Guid userId, int year, int month, string scope,
        string currency, bool includeRecent, CancellationToken cancellationToken)
    {
        var hasActiveAccount = await dbContext.Accounts.AsNoTracking().AnyAsync(account =>
            account.HouseholdId == householdId && account.IsActive &&
            (account.Scope == AccountScope.Household || account.OwnerUserId == userId), cancellationToken);
        var visible = VisibleTransactionQuery.Create(dbContext, householdId, userId);
        var hasTransactions = await visible.AnyAsync(cancellationToken);
        var uncategorizedCount = await VisibleTransactionQuery.Create(dbContext, householdId, userId,
            fromDate: new DateOnly(year, month, 1),
            toDate: new DateOnly(year, month, DateTime.DaysInMonth(year, month)),
            uncategorizedOnly: true, budgetInclusion: scope, currency: currency, spendingOnly: true)
            .CountAsync(cancellationToken);
        IReadOnlyList<DashboardRecentTransaction>? recent = null;
        if (includeRecent)
        {
            recent = await visible.OrderByDescending(row => row.Transaction.TransactionDate)
                .ThenByDescending(row => row.Transaction.Id).Take(5)
                .Select(row => new DashboardRecentTransaction(
                    row.Transaction.Id,
                    row.Account.Scope == AccountScope.Personal && row.Account.OwnerUserId != userId
                        ? "Shared expense (private account)" : row.Account.Name,
                    row.Account.Currency, row.Transaction.TransactionDate, row.Transaction.Amount, row.Transaction.Description))
                .ToListAsync(cancellationToken);
        }
        return new(hasActiveAccount, hasTransactions, uncategorizedCount, recent);
    }
}
