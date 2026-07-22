using BudgetApp.Application.Households;
using BudgetApp.Application.Finance;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Accounts;

public sealed class AccountManagementService(
    IAccountRepository accountRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<AccountListItem>> ListAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);

        return (await accountRepository.ListVisibleAsync(
                householdId,
                userId,
                cancellationToken))
            .OrderBy(account => account.Scope)
            .ThenBy(account => account.Name)
            .Select(ToListItem)
            .ToList();
    }

    public async Task<Guid> CreateAsync(
        Guid householdId,
        Guid userId,
        string name,
        string type,
        string scope,
        string currency,
        string? institutionName,
        string? lastFourDigits,
        CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);
        var accountType = ParseAccountType(type);
        var accountScope = ParseAccountScope(scope);

        if (accountScope == AccountScope.Household && role == HouseholdRole.Viewer)
        {
            throw new HouseholdAccessDeniedException();
        }

        var normalizedCurrency = CurrencyCatalog.NormalizeSupported(currency);
        var createdAtUtc = timeProvider.GetUtcNow();
        var account = accountScope == AccountScope.Personal
            ? Account.CreatePersonal(
                householdId,
                userId,
                name,
                accountType,
                normalizedCurrency,
                institutionName,
                lastFourDigits,
                createdAtUtc)
            : Account.CreateHousehold(
                householdId,
                name,
                accountType,
                normalizedCurrency,
                institutionName,
                lastFourDigits,
                createdAtUtc);

        await accountRepository.AddAsync(account, cancellationToken);
        await accountRepository.SaveChangesAsync(cancellationToken);
        return account.Id;
    }

    public async Task UpdateAsync(
        Guid householdId,
        Guid userId,
        Guid accountId,
        string name,
        string type,
        string scope,
        string currency,
        string? institutionName,
        string? lastFourDigits,
        CancellationToken cancellationToken)
    {
        var (account, role) = await GetAuthorizedForChange(
            householdId,
            userId,
            accountId,
            cancellationToken);
        var targetScope = ParseAccountScope(scope);
        if (targetScope == AccountScope.Household && role == HouseholdRole.Viewer)
        {
            throw new HouseholdAccessDeniedException();
        }

        var updatedAtUtc = timeProvider.GetUtcNow();
        account.UpdateDetails(
            name,
            ParseAccountType(type),
            institutionName,
            lastFourDigits,
            updatedAtUtc);
        account.UpdateFinancialSettings(
            targetScope,
            targetScope == AccountScope.Personal ? userId : null,
            CurrencyCatalog.NormalizeSupported(currency),
            updatedAtUtc);
        await accountRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task SetActiveAsync(
        Guid householdId,
        Guid userId,
        Guid accountId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        var (account, _) = await GetAuthorizedForChange(
            householdId,
            userId,
            accountId,
            cancellationToken);

        if (isActive)
        {
            account.Reactivate(timeProvider.GetUtcNow());
        }
        else
        {
            account.Archive(timeProvider.GetUtcNow());
        }

        await accountRepository.SaveChangesAsync(cancellationToken);
    }

    private async Task<(Account Account, HouseholdRole Role)> GetAuthorizedForChange(
        Guid householdId,
        Guid userId,
        Guid accountId,
        CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);
        var account = await accountRepository.GetForUpdateAsync(
            householdId,
            accountId,
            cancellationToken) ?? throw new AccountNotFoundException();

        if (account.Scope == AccountScope.Personal)
        {
            if (account.OwnerUserId != userId)
            {
                throw new AccountNotFoundException();
            }
        }
        else if (role == HouseholdRole.Viewer)
        {
            throw new HouseholdAccessDeniedException();
        }

        return (account, role);
    }

    private static AccountType ParseAccountType(string type)
    {
        if (!Enum.TryParse<AccountType>(type, ignoreCase: true, out var parsedType) ||
            !Enum.IsDefined(parsedType))
        {
            throw new ArgumentException("Account type is not supported.", nameof(type));
        }

        return parsedType;
    }

    private static AccountScope ParseAccountScope(string scope)
    {
        if (!Enum.TryParse<AccountScope>(scope, ignoreCase: true, out var parsedScope) ||
            !Enum.IsDefined(parsedScope))
        {
            throw new ArgumentException("Account scope is not supported.", nameof(scope));
        }

        return parsedScope;
    }

    private static AccountListItem ToListItem(Account account) =>
        new(
            account.Id,
            account.Name,
            account.Type.ToString(),
            account.Scope.ToString(),
            account.OwnerUserId,
            account.Currency,
            account.InstitutionName,
            account.LastFourDigits,
            account.IsActive);
}
