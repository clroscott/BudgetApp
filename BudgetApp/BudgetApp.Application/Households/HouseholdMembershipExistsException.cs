namespace BudgetApp.Application.Households;

public sealed class HouseholdMembershipExistsException()
    : InvalidOperationException(
        "The user already has an active household membership.");
