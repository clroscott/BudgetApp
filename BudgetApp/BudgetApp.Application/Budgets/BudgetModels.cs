namespace BudgetApp.Application.Budgets;

public sealed record BudgetPageModel(
    Guid? Id,
    int Year,
    int Month,
    string Scope,
    string Currency,
    string? Status,
    DateTimeOffset? UpdatedAtUtc,
    IReadOnlyList<BudgetCategoryModel> Categories);

public sealed record BudgetCategoryModel(
    Guid Id,
    string Name,
    bool IsActive,
    decimal? BudgetedAmount,
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
