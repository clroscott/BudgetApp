using BudgetApp.Application.Households;
using BudgetApp.Domain.Budgeting;

namespace BudgetApp.Application.Budgets;

public sealed class BudgetManagementService(
    IBudgetRepository budgetRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<BudgetPageModel> GetAsync(
        Guid householdId,
        Guid userId,
        int year,
        int month,
        string scope,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        var budgetScope = ParseScope(scope);
        ValidatePeriod(year, month);
        Guid? ownerUserId = budgetScope == BudgetScope.Personal ? userId : null;
        var budget = await budgetRepository.GetAsync(
            householdId, year, month, budgetScope, ownerUserId,
            forUpdate: false, cancellationToken);
        var currency = budget?.Currency ??
            await budgetRepository.GetHouseholdCurrencyAsync(householdId, cancellationToken) ??
            throw new HouseholdAccessDeniedException();
        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId, cancellationToken);

        return BuildModel(budget, year, month, budgetScope, currency, categories);
    }

    public async Task<BudgetPageModel> CreateAsync(
        Guid householdId,
        Guid userId,
        int year,
        int month,
        string scope,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var budgetScope = ParseScope(scope);
        ValidatePeriod(year, month);
        Guid? ownerUserId = budgetScope == BudgetScope.Personal ? userId : null;
        if (await budgetRepository.GetAsync(
                householdId, year, month, budgetScope, ownerUserId,
                forUpdate: false, cancellationToken) is not null)
        {
            throw new InvalidOperationException("A budget already exists for this month and scope.");
        }

        var currency = await budgetRepository.GetHouseholdCurrencyAsync(
            householdId, cancellationToken) ?? throw new HouseholdAccessDeniedException();
        var now = timeProvider.GetUtcNow();
        var budget = budgetScope == BudgetScope.Household
            ? BudgetMonth.CreateHousehold(householdId, year, month, currency, now)
            : BudgetMonth.CreatePersonal(householdId, userId, year, month, currency, now);
        await budgetRepository.AddAsync(budget, cancellationToken);
        await budgetRepository.SaveChangesAsync(cancellationToken);
        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId, cancellationToken);
        return BuildModel(budget, year, month, budgetScope, currency, categories);
    }

    public async Task<BudgetPageModel> SaveAsync(
        Guid householdId,
        Guid userId,
        Guid budgetId,
        IReadOnlyList<BudgetLineInput> lines,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var budget = await GetOwnedBudget(householdId, userId, budgetId, cancellationToken);
        if (lines.Select(line => line.CategoryId).Distinct().Count() != lines.Count)
        {
            throw new ArgumentException("Each category can appear only once in a budget.", nameof(lines));
        }

        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId, cancellationToken);
        var categoryById = categories.ToDictionary(category => category.Id);
        foreach (var line in lines)
        {
            if (!categoryById.TryGetValue(line.CategoryId, out var category))
            {
                throw new ArgumentException("Every budget line must use a household expense category.", nameof(lines));
            }

            if (!category.IsActive && budget.Lines.All(existing => existing.CategoryId != line.CategoryId))
            {
                throw new InvalidOperationException("A new budget line cannot use a deactivated category.");
            }
        }

        ValidateSectionModes(lines, categoryById);
        var now = timeProvider.GetUtcNow();
        var requested = lines.ToDictionary(line => line.CategoryId, line => line.BudgetedAmount);
        foreach (var existing in budget.Lines.ToList())
        {
            if (!requested.TryGetValue(existing.CategoryId, out var amount))
            {
                budget.RemoveLine(existing.CategoryId, now);
            }
            else
            {
                budget.UpdateLineAmount(existing.CategoryId, amount, now);
                requested.Remove(existing.CategoryId);
            }
        }

        foreach (var line in requested)
        {
            var budgetLine = budget.AddLine(line.Key, line.Value, now);
            await budgetRepository.AddLineAsync(budgetLine, cancellationToken);
        }

        await budgetRepository.SaveChangesAsync(cancellationToken);
        return BuildModel(
            budget, budget.Year, budget.Month, budget.Scope, budget.Currency, categories);
    }

    public Task<BudgetPageModel> ActivateAsync(
        Guid householdId, Guid userId, Guid budgetId, CancellationToken cancellationToken) =>
        ChangeStatusAsync(householdId, userId, budgetId, BudgetStatusChange.Activate, cancellationToken);

    public Task<BudgetPageModel> CloseAsync(
        Guid householdId, Guid userId, Guid budgetId, CancellationToken cancellationToken) =>
        ChangeStatusAsync(householdId, userId, budgetId, BudgetStatusChange.Close, cancellationToken);

    public Task<BudgetPageModel> ReopenAsync(
        Guid householdId, Guid userId, Guid budgetId, CancellationToken cancellationToken) =>
        ChangeStatusAsync(householdId, userId, budgetId, BudgetStatusChange.Reopen, cancellationToken);

    private async Task<BudgetPageModel> ChangeStatusAsync(
        Guid householdId,
        Guid userId,
        Guid budgetId,
        BudgetStatusChange change,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var budget = await GetOwnedBudget(householdId, userId, budgetId, cancellationToken);
        var now = timeProvider.GetUtcNow();
        switch (change)
        {
            case BudgetStatusChange.Activate:
                budget.Activate(now);
                break;
            case BudgetStatusChange.Close:
                budget.Close(now);
                break;
            case BudgetStatusChange.Reopen:
                budget.Reopen(now);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(change));
        }
        await budgetRepository.SaveChangesAsync(cancellationToken);
        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId, cancellationToken);
        return BuildModel(
            budget, budget.Year, budget.Month, budget.Scope, budget.Currency, categories);
    }

    private async Task<BudgetMonth> GetOwnedBudget(
        Guid householdId,
        Guid userId,
        Guid budgetId,
        CancellationToken cancellationToken)
    {
        return await budgetRepository.GetByIdForUpdateAsync(
            householdId, budgetId, userId, cancellationToken)
            ?? throw new BudgetNotFoundException();
    }

    private static void ValidateSectionModes(
        IReadOnlyList<BudgetLineInput> lines,
        IReadOnlyDictionary<Guid, BudgetCategoryRecord> categoryById)
    {
        var lineIds = lines.Select(line => line.CategoryId).ToHashSet();
        foreach (var root in categoryById.Values.Where(category => !category.ParentCategoryId.HasValue))
        {
            if (lineIds.Contains(root.Id) && categoryById.Values.Any(category =>
                    category.ParentCategoryId == root.Id && lineIds.Contains(category.Id)))
            {
                throw new InvalidOperationException(
                    $"{root.Name} cannot have both an overall budget and subcategory budgets.");
            }
        }
    }

    private static BudgetPageModel BuildModel(
        BudgetMonth? budget,
        int year,
        int month,
        BudgetScope scope,
        string currency,
        IReadOnlyList<BudgetCategoryRecord> categories)
    {
        var amounts = budget?.Lines.ToDictionary(line => line.CategoryId, line => (decimal?)line.BudgetedAmount)
            ?? new Dictionary<Guid, decimal?>();
        var children = categories
            .Where(category => category.ParentCategoryId.HasValue)
            .GroupBy(category => category.ParentCategoryId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderBy(item => item.DisplayOrder).ToList());
        var roots = categories
            .Where(category => !category.ParentCategoryId.HasValue)
            .OrderBy(category => category.DisplayOrder)
            .Select(root => ToModel(root, amounts, children.GetValueOrDefault(root.Id, [])))
            .Where(root => root.IsActive || root.BudgetedAmount.HasValue ||
                root.Children.Any(child => child.IsActive || child.BudgetedAmount.HasValue))
            .ToList();
        return new BudgetPageModel(
            budget?.Id, year, month, scope.ToString(), currency,
            budget?.Status.ToString(), budget?.UpdatedAtUtc, roots);
    }

    private static BudgetCategoryModel ToModel(
        BudgetCategoryRecord category,
        IReadOnlyDictionary<Guid, decimal?> amounts,
        IReadOnlyList<BudgetCategoryRecord> children) =>
        new(category.Id, category.Name, category.IsActive,
            amounts.GetValueOrDefault(category.Id),
            children.Select(child => new BudgetCategoryModel(
                    child.Id, child.Name, child.IsActive,
                    amounts.GetValueOrDefault(child.Id), []))
                .Where(child => child.IsActive || child.BudgetedAmount.HasValue)
                .ToList());

    private static BudgetScope ParseScope(string scope) =>
        Enum.TryParse<BudgetScope>(scope, true, out var parsed) && Enum.IsDefined(parsed)
            ? parsed
            : throw new ArgumentException("Budget scope must be Household or Personal.", nameof(scope));

    private static void ValidatePeriod(int year, int month)
    {
        if (year is < BudgetMonth.MinimumYear or > BudgetMonth.MaximumYear || month is < 1 or > 12)
            throw new ArgumentOutOfRangeException(nameof(year), "Enter a valid budget month and year.");
    }

    private enum BudgetStatusChange
    {
        Activate,
        Close,
        Reopen
    }
}
