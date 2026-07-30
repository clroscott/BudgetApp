using BudgetApp.Application.Households;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;

namespace BudgetApp.Application.Budgets;

public sealed class AnnualBudgetOverviewService(
    IBudgetRepository budgetRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<AnnualBudgetOverviewModel> GetAsync(
        Guid householdId,
        Guid userId,
        int year,
        string scope,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);
        if (year is < BudgetMonth.MinimumYear or > BudgetMonth.MaximumYear)
            throw new ArgumentOutOfRangeException(nameof(year));

        var budgetScope = ParseScope(scope);
        var ownerUserId = budgetScope == BudgetScope.Personal ? userId : (Guid?)null;
        var currency = await budgetRepository.GetHouseholdCurrencyAsync(
            householdId,
            cancellationToken) ?? throw new HouseholdAccessDeniedException();
        var budgets = await budgetRepository.ListYearAsync(
            householdId,
            year,
            budgetScope,
            ownerUserId,
            cancellationToken);
        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId,
            cancellationToken);
        var actuals = await budgetRepository.GetAnnualTransactionsAsync(
            householdId,
            userId,
            year,
            budgetScope,
            currency,
            cancellationToken);

        var budgetedByCategory = budgets
            .SelectMany(budget => budget.Lines)
            .GroupBy(line => line.CategoryId)
            .ToDictionary(
                group => group.Key,
                group => group.Sum(line => line.BudgetedAmount));
        var expenseTransactions = actuals.Transactions
            .Where(transaction => transaction.CategoryType == CategoryType.Expense)
            .ToList();
        var actualByCategory = expenseTransactions
            .Where(transaction => transaction.CategoryId.HasValue)
            .GroupBy(transaction => transaction.CategoryId!.Value)
            .ToDictionary(
                group => group.Key,
                group => group.Sum(transaction => transaction.Amount));
        var averageMonthCount = GetAverageMonthCount(year);
        var categoryModels = categories
            .Where(category => !category.ParentCategoryId.HasValue)
            .OrderBy(category => category.DisplayOrder)
            .ThenBy(category => category.Name)
            .Select(root => BuildCategory(
                root,
                categories
                    .Where(category => category.ParentCategoryId == root.Id)
                    .OrderBy(category => category.DisplayOrder)
                    .ThenBy(category => category.Name)
                    .ToList(),
                budgetedByCategory,
                actualByCategory,
                averageMonthCount))
            .ToList();

        var months = Enumerable.Range(1, 12)
            .Select(month => BuildMonth(
                year,
                month,
                budgets.SingleOrDefault(budget => budget.Month == month),
                actuals.Transactions))
            .ToList();
        var annualBudgeted = budgets
            .SelectMany(budget => budget.Lines)
            .Sum(line => line.BudgetedAmount);
        var actualSpending = months.Sum(month => month.ActualSpendingAmount);
        var income = months.Sum(month => month.IncomeAmount);
        var uncategorizedSpending = actuals.Transactions
            .Where(transaction =>
                !transaction.CategoryId.HasValue &&
                transaction.Amount > 0)
            .Sum(transaction => transaction.Amount);

        return new AnnualBudgetOverviewModel(
            year,
            budgetScope.ToString(),
            currency,
            averageMonthCount,
            budgets.Count,
            annualBudgeted,
            actualSpending,
            budgets.Count == 0 ? null : annualBudgeted - actualSpending,
            income,
            income - actualSpending,
            uncategorizedSpending,
            actuals.CurrencyMismatchTransactionCount,
            months,
            categoryModels);
    }

    private AnnualBudgetMonthModel BuildMonth(
        int year,
        int month,
        BudgetMonth? budget,
        IReadOnlyList<AnnualTransactionRecord> transactions)
    {
        var monthTransactions = transactions
            .Where(transaction => transaction.Month == month)
            .ToList();
        var budgeted = budget?.Lines.Sum(line => line.BudgetedAmount);
        var spending = monthTransactions
            .Where(transaction =>
                transaction.CategoryType == CategoryType.Expense ||
                !transaction.CategoryId.HasValue && transaction.Amount > 0)
            .Sum(transaction => transaction.Amount);
        var income = monthTransactions
            .Where(transaction =>
                (transaction.CategoryType == CategoryType.Income ||
                 !transaction.CategoryId.HasValue) &&
                transaction.Amount < 0)
            .Sum(transaction => -transaction.Amount);
        return new AnnualBudgetMonthModel(
            budget?.Id,
            year,
            month,
            budget?.Status.ToString(),
            budgeted,
            spending,
            budget is null ? null : budgeted - spending,
            income,
            income - spending);
    }

    private static AnnualBudgetCategoryModel BuildCategory(
        BudgetCategoryRecord category,
        IReadOnlyList<BudgetCategoryRecord> children,
        IReadOnlyDictionary<Guid, decimal> budgeted,
        IReadOnlyDictionary<Guid, decimal> actuals,
        int averageMonthCount)
    {
        var childModels = children
            .Select(child => BuildCategory(
                child,
                [],
                budgeted,
                actuals,
                averageMonthCount))
            .ToList();
        var hasDirectBudget = budgeted.TryGetValue(category.Id, out var directBudget);
        var childBudgets = childModels
            .Where(child => child.BudgetedAmount.HasValue)
            .Select(child => child.BudgetedAmount!.Value)
            .ToList();
        decimal? totalBudget = hasDirectBudget || childBudgets.Count > 0
            ? directBudget + childBudgets.Sum()
            : null;
        var directActual = actuals.GetValueOrDefault(category.Id);
        var totalActual = directActual + childModels.Sum(child => child.ActualAmount);
        return new AnnualBudgetCategoryModel(
            category.Id,
            category.Name,
            category.IsActive,
            totalBudget,
            totalActual,
            totalBudget.HasValue ? totalBudget.Value - totalActual : null,
            averageMonthCount == 0 ? 0 : totalActual / averageMonthCount,
            directActual,
            childModels);
    }

    private int GetAverageMonthCount(int year)
    {
        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().LocalDateTime);
        if (year < today.Year) return 12;
        if (year > today.Year) return 0;
        return today.Month;
    }

    private static BudgetScope ParseScope(string scope) =>
        Enum.TryParse<BudgetScope>(scope, true, out var parsed) &&
        Enum.IsDefined(parsed)
            ? parsed
            : throw new ArgumentException(
                "Budget scope must be Household or Personal.");
}
