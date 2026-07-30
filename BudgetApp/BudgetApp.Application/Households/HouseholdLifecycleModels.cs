namespace BudgetApp.Application.Households;

public sealed record HouseholdExitOptions(
    bool CanLeave,
    bool CanDeleteUnused,
    string? BlockedReason);

public sealed class HouseholdExitNotAllowedException(string message)
    : Exception(message);
