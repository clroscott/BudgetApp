namespace BudgetApp.Application.Budgets;

public sealed record YearlyPlanPageModel(
    Guid? Id,
    int FiscalYearStartYear,
    int FiscalYearStartMonth,
    int HouseholdDefaultFiscalYearStartMonth,
    string Scope,
    string Currency,
    DateOnly StartsOn,
    DateOnly EndsOn,
    DateTimeOffset? UpdatedAtUtc,
    IReadOnlyList<YearlyTargetCategoryModel> Categories);

public sealed record YearlyTargetCategoryModel(
    Guid Id,
    string Name,
    bool IsActive,
    decimal? AnnualTargetAmount,
    decimal? EquivalentMonthlyAmount,
    IReadOnlyList<YearlyTargetCategoryModel> Children);

public sealed record YearlyTargetLineInput(Guid CategoryId, decimal AnnualTargetAmount);

public sealed record YearlyAllocationPeriodInput(int Year, int Month);

public sealed record YearlyPlanDefaults(
    string Currency,
    int FiscalYearStartMonth);

public sealed record YearlyAllocationMonthResult(
    int Year,
    int Month,
    string Result,
    Guid? BudgetId);

public sealed record YearlyAllocationResult(
    int CreatedCount,
    int ReplacedDraftCount,
    int SkippedCount,
    IReadOnlyList<YearlyAllocationMonthResult> Months);
