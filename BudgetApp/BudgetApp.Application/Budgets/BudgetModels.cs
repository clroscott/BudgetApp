namespace BudgetApp.Application.Budgets;

public sealed record BudgetPageModel(
    Guid? Id,
    int Year,
    int Month,
    string Scope,
    string Currency,
    string? Status,
    DateTimeOffset? UpdatedAtUtc,
    IReadOnlyList<BudgetCategoryModel> Categories,
    decimal UncategorizedActualAmount,
    int CurrencyMismatchTransactionCount);

public sealed record BudgetCategoryModel(
    Guid Id,
    string Name,
    bool IsActive,
    decimal? BudgetedAmount,
    decimal ActualAmount,
    decimal DirectActualAmount,
    decimal AverageMonthlyActualAmount,
    decimal? LastMonthBudgetedAmount,
    decimal LastMonthActualAmount,
    IReadOnlyList<BudgetCategoryModel> Children);

public sealed record BudgetLineInput(Guid CategoryId, decimal BudgetedAmount);

public sealed record BudgetMonthOption(
    Guid Id,
    int Year,
    int Month,
    string Status);

public sealed record BudgetCategoryRecord(
    Guid Id,
    string Name,
    Guid? ParentCategoryId,
    int DisplayOrder,
    bool IsActive);

public sealed record BudgetActualsRecord(
    IReadOnlyDictionary<Guid, decimal> AmountsByCategoryId,
    decimal UncategorizedAmount,
    int CurrencyMismatchTransactionCount);

public sealed record BudgetHistoricalActualRecord(
    Guid CategoryId,
    int Year,
    int Month,
    decimal Amount);
