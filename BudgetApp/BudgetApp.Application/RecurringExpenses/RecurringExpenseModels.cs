using BudgetApp.Domain.RecurringExpenses;

namespace BudgetApp.Application.RecurringExpenses;

public sealed record RecurringExpenseListItem(
    Guid Id,
    string Name,
    decimal Amount,
    string Currency,
    string Scope,
    Guid? OwnerUserId,
    string BudgetMode,
    Guid SubcategoryId,
    string CategoryName,
    string SubcategoryName,
    Guid? AccountId,
    string? AccountName,
    int? ExpectedDayOfMonth,
    DateOnly StartsOn,
    DateOnly? EndsOn,
    bool IsActive);

public sealed record RecurringExpenseRecord(
    Guid Id,
    string Name,
    decimal Amount,
    string Currency,
    RecurringExpenseScope Scope,
    Guid? OwnerUserId,
    RecurringExpenseBudgetMode BudgetMode,
    Guid SubcategoryId,
    string CategoryName,
    string SubcategoryName,
    Guid? AccountId,
    string? AccountName,
    int? ExpectedDayOfMonth,
    DateOnly StartsOn,
    DateOnly? EndsOn,
    bool IsActive);
