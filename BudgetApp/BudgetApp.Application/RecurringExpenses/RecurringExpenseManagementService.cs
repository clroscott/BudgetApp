using BudgetApp.Application.Accounts;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Finance;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.RecurringExpenses;

namespace BudgetApp.Application.RecurringExpenses;

public sealed class RecurringExpenseManagementService(
    IRecurringExpenseRepository recurringExpenseRepository,
    ICategoryRepository categoryRepository,
    IAccountRepository accountRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<RecurringExpenseListItem>> ListAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        return (await recurringExpenseRepository.ListVisibleAsync(
                householdId, userId, cancellationToken))
            .OrderBy(item => item.Scope)
            .ThenBy(item => item.CategoryName)
            .ThenBy(item => item.SubcategoryName)
            .ThenBy(item => item.Name)
            .Select(item => new RecurringExpenseListItem(
                item.Id, item.Name, item.Amount, item.Currency, item.Scope.ToString(),
                item.OwnerUserId, item.SubcategoryId, item.CategoryName,
                item.SubcategoryName, item.AccountId, item.AccountName,
                item.ExpectedDayOfMonth, item.StartsOn, item.EndsOn, item.IsActive))
            .ToList();
    }

    public async Task<Guid> CreateAsync(
        Guid householdId,
        Guid userId,
        string name,
        decimal amount,
        string scope,
        Guid subcategoryId,
        Guid? accountId,
        int? expectedDayOfMonth,
        DateOnly startsOn,
        DateOnly? endsOn,
        CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        var parsedScope = ParseScope(scope);
        EnsureScopePermission(parsedScope, role);
        var currency = await GetCurrency(householdId, cancellationToken);
        await ValidateReferences(
            householdId, userId, parsedScope, currency,
            subcategoryId, accountId, cancellationToken);

        var now = timeProvider.GetUtcNow();
        var expense = parsedScope == RecurringExpenseScope.Personal
            ? RecurringExpense.CreatePersonal(
                householdId, userId, name, amount, currency, subcategoryId,
                accountId, expectedDayOfMonth, startsOn, endsOn, now)
            : RecurringExpense.CreateHousehold(
                householdId, name, amount, currency, subcategoryId,
                accountId, expectedDayOfMonth, startsOn, endsOn, now);
        await recurringExpenseRepository.AddAsync(expense, cancellationToken);
        await recurringExpenseRepository.SaveChangesAsync(cancellationToken);
        return expense.Id;
    }

    public async Task UpdateAsync(
        Guid householdId,
        Guid userId,
        Guid recurringExpenseId,
        string name,
        decimal amount,
        string scope,
        Guid subcategoryId,
        Guid? accountId,
        int? expectedDayOfMonth,
        DateOnly startsOn,
        DateOnly? endsOn,
        CancellationToken cancellationToken)
    {
        var (expense, role) = await GetAuthorizedForChange(
            householdId, userId, recurringExpenseId, cancellationToken);
        var parsedScope = ParseScope(scope);
        EnsureScopePermission(parsedScope, role);
        var currency = await GetCurrency(householdId, cancellationToken);
        await ValidateReferences(
            householdId, userId, parsedScope, currency,
            subcategoryId, accountId, cancellationToken);

        expense.Update(
            parsedScope,
            parsedScope == RecurringExpenseScope.Personal ? userId : null,
            name,
            amount,
            currency,
            subcategoryId,
            accountId,
            expectedDayOfMonth,
            startsOn,
            endsOn,
            timeProvider.GetUtcNow());
        await recurringExpenseRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task SetActiveAsync(
        Guid householdId,
        Guid userId,
        Guid recurringExpenseId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        var (expense, _) = await GetAuthorizedForChange(
            householdId, userId, recurringExpenseId, cancellationToken);
        if (isActive) expense.Reactivate(timeProvider.GetUtcNow());
        else expense.Deactivate(timeProvider.GetUtcNow());
        await recurringExpenseRepository.SaveChangesAsync(cancellationToken);
    }

    private async Task<(RecurringExpense Expense, HouseholdRole Role)> GetAuthorizedForChange(
        Guid householdId,
        Guid userId,
        Guid recurringExpenseId,
        CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        var expense = await recurringExpenseRepository.GetForUpdateAsync(
            householdId, recurringExpenseId, cancellationToken)
            ?? throw new RecurringExpenseNotFoundException();
        if (expense.Scope == RecurringExpenseScope.Personal && expense.OwnerUserId != userId)
            throw new RecurringExpenseNotFoundException();
        if (expense.Scope == RecurringExpenseScope.Household && role == HouseholdRole.Viewer)
            throw new HouseholdAccessDeniedException();
        return (expense, role);
    }

    private async Task ValidateReferences(
        Guid householdId,
        Guid userId,
        RecurringExpenseScope scope,
        string currency,
        Guid subcategoryId,
        Guid? accountId,
        CancellationToken cancellationToken)
    {
        var category = await categoryRepository.GetForUpdateAsync(
            householdId, subcategoryId, cancellationToken);
        if (category is null || category.Type != CategoryType.Expense ||
            !category.ParentCategoryId.HasValue || !category.IsActive ||
            category.Parent?.IsActive != true)
        {
            throw new ArgumentException(
                "Recurring expenses require an active expense subcategory.",
                nameof(subcategoryId));
        }

        if (!accountId.HasValue) return;
        var account = await accountRepository.GetForUpdateAsync(
            householdId, accountId.Value, cancellationToken);
        if (account is null || !account.IsActive)
            throw new ArgumentException("Select an active account in this household.", nameof(accountId));
        if (!string.Equals(account.Currency, currency, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("The account currency must match the household budget currency.", nameof(accountId));
        if (scope == RecurringExpenseScope.Personal &&
            (account.Scope != AccountScope.Personal || account.OwnerUserId != userId))
            throw new ArgumentException("A personal recurring expense requires one of your personal accounts.", nameof(accountId));
        if (scope == RecurringExpenseScope.Household && account.Scope != AccountScope.Household)
            throw new ArgumentException("A household recurring expense requires a household account.", nameof(accountId));
    }

    private async Task<string> GetCurrency(Guid householdId, CancellationToken cancellationToken) =>
        CurrencyCatalog.NormalizeSupported(
            await recurringExpenseRepository.GetHouseholdCurrencyAsync(householdId, cancellationToken)
            ?? throw new HouseholdAccessDeniedException());

    private static RecurringExpenseScope ParseScope(string scope) =>
        Enum.TryParse<RecurringExpenseScope>(scope, true, out var parsed) && Enum.IsDefined(parsed)
            ? parsed
            : throw new ArgumentException("Recurring expense scope is not supported.", nameof(scope));

    private static void EnsureScopePermission(
        RecurringExpenseScope scope,
        HouseholdRole role)
    {
        if (scope == RecurringExpenseScope.Household && role == HouseholdRole.Viewer)
            throw new HouseholdAccessDeniedException();
    }
}
