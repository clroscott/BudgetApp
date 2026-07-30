using BudgetApp.Application.Accounts;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Finance;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.RecurringExpenses;

namespace BudgetApp.Application.RecurringExpenses;

public sealed class RecurringExpenseManagementService(
    IRecurringExpenseRepository recurringExpenseRepository,
    ICategoryRepository categoryRepository,
    IAccountRepository accountRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider,
    AuditWriter? auditWriter = null)
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
                item.OwnerUserId, item.BudgetMode.ToString(),
                item.SubcategoryId, item.CategoryName,
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
        string budgetMode,
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
        var parsedBudgetMode = ParseBudgetMode(budgetMode);
        EnsureScopePermission(parsedScope, role);
        var currency = await GetCurrency(householdId, cancellationToken);
        await ValidateReferences(
            householdId, userId, parsedScope, currency,
            subcategoryId, accountId, cancellationToken);

        var now = timeProvider.GetUtcNow();
        var expense = parsedScope == RecurringExpenseScope.Personal
            ? RecurringExpense.CreatePersonal(
                householdId, userId, name, amount, currency, subcategoryId,
                accountId, expectedDayOfMonth, startsOn, endsOn, now, parsedBudgetMode)
            : RecurringExpense.CreateHousehold(
                householdId, name, amount, currency, subcategoryId,
                accountId, expectedDayOfMonth, startsOn, endsOn, now, parsedBudgetMode);
        await recurringExpenseRepository.AddAsync(expense, cancellationToken);
        RecordExpenseEvent(
            expense,
            userId,
            AuditActions.Created,
            $"Created recurring expense '{expense.Name}'.");
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
        string budgetMode,
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
        var parsedBudgetMode = ParseBudgetMode(budgetMode);
        EnsureScopePermission(parsedScope, role);
        var currency = await GetCurrency(householdId, cancellationToken);
        await ValidateReferences(
            householdId, userId, parsedScope, currency,
            subcategoryId, accountId, cancellationToken);

        var previousName = expense.Name;
        var previousAmount = expense.Amount;
        expense.Update(
            parsedScope,
            parsedScope == RecurringExpenseScope.Personal ? userId : null,
            name,
            amount,
            currency,
            subcategoryId,
            parsedBudgetMode,
            accountId,
            expectedDayOfMonth,
            startsOn,
            endsOn,
            timeProvider.GetUtcNow());
        RecordExpenseEvent(
            expense,
            userId,
            AuditActions.Updated,
            $"Updated recurring expense '{expense.Name}'.",
            new Dictionary<string, string?>
            {
                ["Name"] = $"{previousName} → {expense.Name}",
                ["Amount"] = $"{previousAmount:0.00} → {expense.Amount:0.00}"
            });
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
        RecordExpenseEvent(
            expense,
            userId,
            isActive ? AuditActions.Activated : AuditActions.Deactivated,
            $"{(isActive ? "Activated" : "Deactivated")} recurring expense " +
            $"'{expense.Name}'.");
        await recurringExpenseRepository.SaveChangesAsync(cancellationToken);
    }

    private void RecordExpenseEvent(
        RecurringExpense expense,
        Guid actorUserId,
        string action,
        string summary,
        IReadOnlyDictionary<string, string?>? details = null)
    {
        auditWriter?.Record(new AuditEventInput(
            expense.HouseholdId,
            actorUserId,
            expense.Scope == RecurringExpenseScope.Personal
                ? AuditVisibility.Personal
                : AuditVisibility.Household,
            expense.Scope == RecurringExpenseScope.Personal
                ? expense.OwnerUserId
                : null,
            action,
            AuditEntityTypes.RecurringExpense,
            expense.Id,
            summary,
            details));
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

    private static RecurringExpenseBudgetMode ParseBudgetMode(string budgetMode) =>
        Enum.TryParse<RecurringExpenseBudgetMode>(budgetMode, true, out var parsed) &&
        Enum.IsDefined(parsed)
            ? parsed
            : throw new ArgumentException(
                "Budget placement must be Overall or Detailed.", nameof(budgetMode));

    private static void EnsureScopePermission(
        RecurringExpenseScope scope,
        HouseholdRole role)
    {
        if (scope == RecurringExpenseScope.Household && role == HouseholdRole.Viewer)
            throw new HouseholdAccessDeniedException();
    }
}
