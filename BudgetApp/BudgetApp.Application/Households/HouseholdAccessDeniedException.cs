namespace BudgetApp.Application.Households;

public sealed class HouseholdAccessDeniedException()
    : InvalidOperationException("You do not have permission to access this household.");
