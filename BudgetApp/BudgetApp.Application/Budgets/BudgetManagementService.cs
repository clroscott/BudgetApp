using BudgetApp.Application.Households;
using BudgetApp.Application.RecurringExpenses;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.RecurringExpenses;

namespace BudgetApp.Application.Budgets;

public sealed class BudgetManagementService(
    IBudgetRepository budgetRepository,
    IRecurringExpenseRepository recurringExpenseRepository,
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

        return await BuildModelAsync(
            budget, year, month, budgetScope, currency, categories,
            householdId, userId, cancellationToken);
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
        return await BuildModelAsync(
            budget, year, month, budgetScope, currency, categories,
            householdId, userId, cancellationToken);
    }

    public async Task<IReadOnlyList<BudgetMonthOption>> ListAvailableAsync(
        Guid householdId,
        Guid userId,
        string scope,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        var budgetScope = ParseScope(scope);
        return await budgetRepository.ListAvailableAsync(
            householdId,
            budgetScope,
            budgetScope == BudgetScope.Personal ? userId : null,
            cancellationToken);
    }

    public async Task<BudgetPageModel> CopyFromAsync(
        Guid householdId,
        Guid userId,
        int year,
        int month,
        string scope,
        int sourceYear,
        int sourceMonth,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var budgetScope = ParseScope(scope);
        ValidatePeriod(year, month);
        Guid? ownerUserId = budgetScope == BudgetScope.Personal ? userId : null;
        await EnsureBudgetDoesNotExist(
            householdId, year, month, budgetScope, ownerUserId, cancellationToken);
        ValidatePeriod(sourceYear, sourceMonth);
        if (year == sourceYear && month == sourceMonth)
            throw new InvalidOperationException("The source and target budget months must be different.");
        var source = await budgetRepository.GetAsync(
            householdId, sourceYear, sourceMonth,
            budgetScope, ownerUserId, forUpdate: false, cancellationToken)
            ?? throw new InvalidOperationException(
                "The selected source budget does not exist in this scope.");
        var currency = await GetHouseholdCurrency(householdId, cancellationToken);
        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId, cancellationToken);
        var activeCategoryIds = categories
            .Where(category => category.IsActive)
            .Select(category => category.Id)
            .ToHashSet();
        var budget = CreateBudget(
            householdId, userId, year, month, budgetScope, currency);
        var now = timeProvider.GetUtcNow();
        foreach (var line in source.Lines.Where(line => activeCategoryIds.Contains(line.CategoryId)))
            budget.AddLine(line.CategoryId, line.BudgetedAmount, now);
        await budgetRepository.AddAsync(budget, cancellationToken);
        await budgetRepository.SaveChangesAsync(cancellationToken);
        return await BuildModelAsync(
            budget, year, month, budgetScope, currency, categories,
            householdId, userId, cancellationToken);
    }

    public async Task<BudgetPageModel> CreateFromRecurringAsync(
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
        await EnsureBudgetDoesNotExist(
            householdId, year, month, budgetScope, ownerUserId, cancellationToken);
        var currency = await GetHouseholdCurrency(householdId, cancellationToken);
        var firstDay = new DateOnly(year, month, 1);
        var lastDay = new DateOnly(year, month, DateTime.DaysInMonth(year, month));
        var recurringScope = budgetScope == BudgetScope.Household
            ? RecurringExpenseScope.Household
            : RecurringExpenseScope.Personal;
        var recurring = await recurringExpenseRepository.ListApplicableAsync(
            householdId, userId, recurringScope, firstDay, lastDay, cancellationToken);
        if (recurring.Count == 0)
            throw new InvalidOperationException(
                "No active recurring expenses apply to this month and scope.");
        if (recurring.Any(expense => !string.Equals(
                expense.Currency, currency, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException(
                "All recurring expenses must use the household budget currency.");

        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId, cancellationToken);
        var activeRootIds = categories
            .Where(category => category.IsActive && !category.ParentCategoryId.HasValue)
            .Select(category => category.Id)
            .ToHashSet();
        var activeSubcategories = categories
            .Where(category =>
                category.IsActive &&
                category.ParentCategoryId.HasValue &&
                activeRootIds.Contains(category.ParentCategoryId.Value))
            .ToDictionary(
                category => category.Id,
                category => category.ParentCategoryId!.Value);
        var applicableExpenses = recurring
            .Where(expense => activeSubcategories.ContainsKey(expense.CategoryId))
            .ToList();
        var mixedModeSection = applicableExpenses
            .GroupBy(expense => activeSubcategories[expense.CategoryId])
            .FirstOrDefault(group =>
                group.Select(expense => expense.BudgetMode).Distinct().Count() > 1);
        if (mixedModeSection is not null)
        {
            var rootName = categories.Single(category =>
                category.Id == mixedModeSection.Key).Name;
            throw new InvalidOperationException(
                $"{rootName} recurring expenses use both Overall and Detailed budget placement. " +
                "Choose one placement for that category before creating the budget.");
        }
        var applicable = applicableExpenses
            .Select(expense => new
            {
                CategoryId = expense.BudgetMode == RecurringExpenseBudgetMode.Overall
                    ? activeSubcategories[expense.CategoryId]
                    : expense.CategoryId,
                expense.Amount
            })
            .GroupBy(expense => expense.CategoryId)
            .Select(group => new { CategoryId = group.Key, Amount = group.Sum(item => item.Amount) })
            .ToList();
        if (applicable.Count == 0)
            throw new InvalidOperationException(
                "No recurring expenses use an active expense subcategory.");

        var budget = CreateBudget(
            householdId, userId, year, month, budgetScope, currency);
        var now = timeProvider.GetUtcNow();
        foreach (var item in applicable)
            budget.AddLine(item.CategoryId, item.Amount, now);
        await budgetRepository.AddAsync(budget, cancellationToken);
        await budgetRepository.SaveChangesAsync(cancellationToken);
        return await BuildModelAsync(
            budget, year, month, budgetScope, currency, categories,
            householdId, userId, cancellationToken);
    }

    public async Task DeleteDraftAsync(
        Guid householdId,
        Guid userId,
        Guid budgetId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var budget = await GetOwnedBudget(householdId, userId, budgetId, cancellationToken);
        if (budget.Status != BudgetStatus.Draft)
            throw new InvalidOperationException("Only a draft budget can be deleted.");
        budgetRepository.Remove(budget);
        await budgetRepository.SaveChangesAsync(cancellationToken);
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
        return await BuildModelAsync(
            budget, budget.Year, budget.Month, budget.Scope, budget.Currency, categories,
            householdId, userId, cancellationToken);
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
        return await BuildModelAsync(
            budget, budget.Year, budget.Month, budget.Scope, budget.Currency, categories,
            householdId, userId, cancellationToken);
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

    private async Task EnsureBudgetDoesNotExist(
        Guid householdId,
        int year,
        int month,
        BudgetScope scope,
        Guid? ownerUserId,
        CancellationToken cancellationToken)
    {
        if (await budgetRepository.GetAsync(
                householdId, year, month, scope, ownerUserId,
                forUpdate: false, cancellationToken) is not null)
            throw new InvalidOperationException(
                "A budget already exists for this month and scope.");
    }

    private async Task<string> GetHouseholdCurrency(
        Guid householdId,
        CancellationToken cancellationToken) =>
        await budgetRepository.GetHouseholdCurrencyAsync(householdId, cancellationToken)
        ?? throw new HouseholdAccessDeniedException();

    private BudgetMonth CreateBudget(
        Guid householdId,
        Guid userId,
        int year,
        int month,
        BudgetScope scope,
        string currency)
    {
        var now = timeProvider.GetUtcNow();
        return scope == BudgetScope.Household
            ? BudgetMonth.CreateHousehold(householdId, year, month, currency, now)
            : BudgetMonth.CreatePersonal(householdId, userId, year, month, currency, now);
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

    private async Task<BudgetPageModel> BuildModelAsync(
        BudgetMonth? budget,
        int year,
        int month,
        BudgetScope scope,
        string currency,
        IReadOnlyList<BudgetCategoryRecord> categories,
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var actuals = await budgetRepository.GetActualsAsync(
            householdId, userId, year, month, scope, currency, cancellationToken);
        var currentMonth = new DateOnly(year, month, 1);
        var availableHistoryMonths = Math.Min(
            12, ((year - 1) * 12) + month - 1);
        IReadOnlyList<BudgetHistoricalActualRecord> historicalActuals = [];
        BudgetMonth? previousBudget = null;
        DateOnly? previousMonth = null;
        if (availableHistoryMonths > 0)
        {
            previousMonth = currentMonth.AddMonths(-1);
            historicalActuals = await budgetRepository.GetHistoricalActualsAsync(
                householdId,
                userId,
                currentMonth.AddMonths(-availableHistoryMonths),
                currentMonth.AddDays(-1),
                scope,
                currency,
                cancellationToken);
            previousBudget = await budgetRepository.GetAsync(
                householdId,
                previousMonth.Value.Year,
                previousMonth.Value.Month,
                scope,
                scope == BudgetScope.Personal ? userId : null,
                forUpdate: false,
                cancellationToken);
        }

        var historicalTotals = historicalActuals
            .GroupBy(item => item.CategoryId)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Amount) / 12m);
        var lastMonthActuals = previousMonth.HasValue
            ? historicalActuals
                .Where(item =>
                    item.Year == previousMonth.Value.Year &&
                    item.Month == previousMonth.Value.Month)
                .ToDictionary(item => item.CategoryId, item => item.Amount)
            : new Dictionary<Guid, decimal>();
        var lastMonthBudgeted = previousBudget?.Lines.ToDictionary(
            line => line.CategoryId, line => (decimal?)line.BudgetedAmount)
            ?? new Dictionary<Guid, decimal?>();

        return BuildModel(
            budget, year, month, scope, currency, categories, actuals,
            historicalTotals, lastMonthBudgeted, lastMonthActuals);
    }

    private static BudgetPageModel BuildModel(
        BudgetMonth? budget,
        int year,
        int month,
        BudgetScope scope,
        string currency,
        IReadOnlyList<BudgetCategoryRecord> categories,
        BudgetActualsRecord actuals,
        IReadOnlyDictionary<Guid, decimal> averageActuals,
        IReadOnlyDictionary<Guid, decimal?> lastMonthBudgeted,
        IReadOnlyDictionary<Guid, decimal> lastMonthActuals)
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
            .Select(root => ToModel(
                root, amounts, actuals.AmountsByCategoryId,
                averageActuals, lastMonthBudgeted, lastMonthActuals,
                children.GetValueOrDefault(root.Id, [])))
            .Where(root => root.IsActive || root.BudgetedAmount.HasValue || root.ActualAmount != 0 ||
                root.Children.Any(child =>
                    child.IsActive || child.BudgetedAmount.HasValue || child.ActualAmount != 0))
            .ToList();
        return new BudgetPageModel(
            budget?.Id, year, month, scope.ToString(), currency,
            budget?.Status.ToString(), budget?.UpdatedAtUtc, roots,
            actuals.UncategorizedAmount, actuals.CurrencyMismatchTransactionCount);
    }

    private static BudgetCategoryModel ToModel(
        BudgetCategoryRecord category,
        IReadOnlyDictionary<Guid, decimal?> amounts,
        IReadOnlyDictionary<Guid, decimal> actuals,
        IReadOnlyDictionary<Guid, decimal> averageActuals,
        IReadOnlyDictionary<Guid, decimal?> lastMonthBudgeted,
        IReadOnlyDictionary<Guid, decimal> lastMonthActuals,
        IReadOnlyList<BudgetCategoryRecord> children) =>
        CreateCategoryModel(
            category, amounts, actuals, averageActuals,
            lastMonthBudgeted, lastMonthActuals, children);

    private static BudgetCategoryModel CreateCategoryModel(
        BudgetCategoryRecord category,
        IReadOnlyDictionary<Guid, decimal?> amounts,
        IReadOnlyDictionary<Guid, decimal> actuals,
        IReadOnlyDictionary<Guid, decimal> averageActuals,
        IReadOnlyDictionary<Guid, decimal?> lastMonthBudgeted,
        IReadOnlyDictionary<Guid, decimal> lastMonthActuals,
        IReadOnlyList<BudgetCategoryRecord> children)
    {
        var childModels = children
            .Select(child => new BudgetCategoryModel(
                child.Id, child.Name, child.IsActive,
                amounts.GetValueOrDefault(child.Id),
                actuals.GetValueOrDefault(child.Id),
                actuals.GetValueOrDefault(child.Id),
                averageActuals.GetValueOrDefault(child.Id),
                lastMonthBudgeted.GetValueOrDefault(child.Id),
                lastMonthActuals.GetValueOrDefault(child.Id), []))
            .Where(child => child.IsActive || child.BudgetedAmount.HasValue || child.ActualAmount != 0)
            .ToList();
        var directActual = actuals.GetValueOrDefault(category.Id);
        var directAverageActual = averageActuals.GetValueOrDefault(category.Id);
        var directLastMonthActual = lastMonthActuals.GetValueOrDefault(category.Id);
        var rootLastMonthBudgeted = lastMonthBudgeted.GetValueOrDefault(category.Id);
        if (!rootLastMonthBudgeted.HasValue)
        {
            var childBudgets = childModels
                .Where(child => child.LastMonthBudgetedAmount.HasValue)
                .Select(child => child.LastMonthBudgetedAmount!.Value)
                .ToList();
            if (childBudgets.Count > 0) rootLastMonthBudgeted = childBudgets.Sum();
        }
        return new BudgetCategoryModel(
            category.Id, category.Name, category.IsActive,
            amounts.GetValueOrDefault(category.Id),
            directActual + childModels.Sum(child => child.ActualAmount),
            directActual,
            directAverageActual + childModels.Sum(child => child.AverageMonthlyActualAmount),
            rootLastMonthBudgeted,
            directLastMonthActual + childModels.Sum(child => child.LastMonthActualAmount),
            childModels);
    }

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
