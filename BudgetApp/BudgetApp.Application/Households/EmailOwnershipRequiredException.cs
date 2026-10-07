namespace BudgetApp.Application.Households;

public sealed class EmailOwnershipRequiredException()
    : Exception("Confirm your account email address before viewing or accepting household invitations.");
