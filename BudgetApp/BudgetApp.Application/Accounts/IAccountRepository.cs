using BudgetApp.Domain.Accounts;

namespace BudgetApp.Application.Accounts;

public interface IAccountRepository
{
    Task<IReadOnlyList<Account>> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken);

    Task<Account?> GetForUpdateAsync(
        Guid householdId,
        Guid accountId,
        CancellationToken cancellationToken);

    Task AddAsync(Account account, CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
