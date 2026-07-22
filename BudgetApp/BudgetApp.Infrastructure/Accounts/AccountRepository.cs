using BudgetApp.Application.Accounts;
using BudgetApp.Domain.Accounts;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Accounts;

internal sealed class AccountRepository(BudgetAppDbContext dbContext)
    : IAccountRepository
{
    public async Task<IReadOnlyList<Account>> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Accounts
            .AsNoTracking()
            .Where(account =>
                account.HouseholdId == householdId &&
                (account.Scope == AccountScope.Household ||
                 account.OwnerUserId == userId))
            .ToListAsync(cancellationToken);
    }

    public Task<Account?> GetForUpdateAsync(
        Guid householdId,
        Guid accountId,
        CancellationToken cancellationToken)
    {
        return dbContext.Accounts.SingleOrDefaultAsync(
            account =>
                account.HouseholdId == householdId &&
                account.Id == accountId,
            cancellationToken);
    }

    public async Task AddAsync(
        Account account,
        CancellationToken cancellationToken)
    {
        await dbContext.Accounts.AddAsync(account, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
