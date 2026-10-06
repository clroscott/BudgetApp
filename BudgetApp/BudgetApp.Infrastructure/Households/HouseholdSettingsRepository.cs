using System.Data;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Households;

internal sealed class HouseholdSettingsRepository(BudgetAppDbContext dbContext) : IHouseholdSettingsRepository
{
    public async Task<HouseholdSettingsSnapshot?> GetAsync(Guid householdId, CancellationToken cancellationToken)
    {
        var household = await dbContext.Households.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == householdId && item.IsActive, cancellationToken);
        return household is null ? null : new(household, await HasFinancialData(householdId, cancellationToken));
    }

    public async Task<HouseholdSettingsSnapshot> UpdateAsync(Guid householdId, DateTimeOffset? version,
        Func<Household, bool, Task> update, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        // Serialize SQL Server settings writers without a shared-lock upgrade deadlock.
        // Serializable range locks also protect the financial-data check until commit.
        var query = dbContext.Database.IsSqlServer()
            ? dbContext.Households.FromSqlInterpolated($"SELECT * FROM [Households] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {householdId}")
            : dbContext.Households.Where(item => item.Id == householdId);
        var household = await query.SingleOrDefaultAsync(item => item.IsActive, cancellationToken)
            ?? throw new HouseholdAccessDeniedException();
        if (version.HasValue && version.Value != household.UpdatedAtUtc) throw new HouseholdSettingsConflictException();
        var locked = await HasFinancialData(householdId, cancellationToken);
        await update(household, locked);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(household, locked);
    }

    private async Task<bool> HasFinancialData(Guid householdId, CancellationToken cancellationToken) =>
        await dbContext.Accounts.AnyAsync(item => item.HouseholdId == householdId, cancellationToken) ||
        await dbContext.ImportFiles.AnyAsync(item => item.HouseholdId == householdId, cancellationToken) ||
        await dbContext.BudgetMonths.AnyAsync(item => item.HouseholdId == householdId, cancellationToken) ||
        await dbContext.YearlyPlans.AnyAsync(item => item.HouseholdId == householdId, cancellationToken) ||
        await dbContext.Transactions.AnyAsync(item => item.HouseholdId == householdId, cancellationToken) ||
        await dbContext.RecurringExpenses.AnyAsync(item => item.HouseholdId == householdId, cancellationToken);
}
