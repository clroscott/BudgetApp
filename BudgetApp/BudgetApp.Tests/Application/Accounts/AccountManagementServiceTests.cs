using BudgetApp.Application.Accounts;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;

namespace BudgetApp.Tests.Application.Accounts;

public sealed class AccountManagementServiceTests
{
    [Fact]
    public async Task CreateHouseholdAccount_Viewer_IsDenied()
    {
        var (service, _) = CreateService(HouseholdRole.Viewer);

        await Assert.ThrowsAsync<HouseholdAccessDeniedException>(() =>
            service.CreateAsync(
                Guid.NewGuid(),
                Guid.NewGuid(),
                "Shared Chequing",
                "Chequing",
                "Household",
                "CAD",
                null,
                null,
                CancellationToken.None));
    }

    [Fact]
    public async Task CreatePersonalAccount_Viewer_CreatesOwnAccount()
    {
        var userId = Guid.NewGuid();
        var (service, repository) = CreateService(HouseholdRole.Viewer);

        await service.CreateAsync(
            Guid.NewGuid(),
            userId,
            "My Cash",
            "Cash",
            "Personal",
            "USD",
            null,
            null,
            CancellationToken.None);

        Assert.NotNull(repository.AddedAccount);
        Assert.Equal(AccountScope.Personal, repository.AddedAccount.Scope);
        Assert.Equal(userId, repository.AddedAccount.OwnerUserId);
        Assert.Equal("USD", repository.AddedAccount.Currency);
    }

    [Fact]
    public async Task UpdateHouseholdAccount_Viewer_IsDenied()
    {
        var account = Account.CreateHousehold(
            Guid.NewGuid(),
            "Shared Cash",
            AccountType.Cash,
            "CAD",
            null,
            null,
            DateTimeOffset.UtcNow);
        var (service, _) = CreateService(HouseholdRole.Viewer, account);

        await Assert.ThrowsAsync<HouseholdAccessDeniedException>(() =>
            service.UpdateAsync(
                account.HouseholdId,
                Guid.NewGuid(),
                account.Id,
                "Updated Cash",
                "Cash",
                "Household",
                "CAD",
                null,
                null,
                CancellationToken.None));
    }

    [Fact]
    public async Task UpdateAnotherUsersPersonalAccount_ReturnsNotFound()
    {
        var account = Account.CreatePersonal(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "Private Cash",
            AccountType.Cash,
            "CAD",
            null,
            null,
            DateTimeOffset.UtcNow);
        var (service, _) = CreateService(HouseholdRole.Owner, account);

        await Assert.ThrowsAsync<AccountNotFoundException>(() =>
            service.UpdateAsync(
                account.HouseholdId,
                Guid.NewGuid(),
                account.Id,
                "Changed",
                "Cash",
                "Personal",
                "CAD",
                null,
                null,
                CancellationToken.None));
    }

    private static (AccountManagementService Service, StubAccountRepository Repository)
        CreateService(HouseholdRole role, Account? existingAccount = null)
    {
        var accountRepository = new StubAccountRepository(existingAccount);
        var authorizationService = new HouseholdAuthorizationService(
            new StubAuthorizationRepository(role));
        return (
            new AccountManagementService(
                accountRepository,
                authorizationService,
                TimeProvider.System),
            accountRepository);
    }

    private sealed class StubAuthorizationRepository(HouseholdRole role)
        : IHouseholdAuthorizationRepository
    {
        public Task<HouseholdRole?> GetActiveRoleAsync(
            Guid householdId,
            Guid userId,
            CancellationToken cancellationToken) =>
            Task.FromResult<HouseholdRole?>(role);
    }

    private sealed class StubAccountRepository(Account? existingAccount)
        : IAccountRepository
    {
        public Account? AddedAccount { get; private set; }

        public Task<IReadOnlyList<Account>> ListVisibleAsync(
            Guid householdId,
            Guid userId,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Account>>([]);

        public Task<Account?> GetForUpdateAsync(
            Guid householdId,
            Guid accountId,
            CancellationToken cancellationToken) =>
            Task.FromResult(existingAccount?.Id == accountId ? existingAccount : null);

        public Task AddAsync(
            Account account,
            CancellationToken cancellationToken)
        {
            AddedAccount = account;
            return Task.CompletedTask;
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken) =>
            Task.CompletedTask;
    }
}
