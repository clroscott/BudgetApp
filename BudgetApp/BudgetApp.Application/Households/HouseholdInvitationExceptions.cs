namespace BudgetApp.Application.Households;

public sealed class HouseholdInvitationConflictException(string message)
    : Exception(message);

public sealed class HouseholdInvitationNotFoundException()
    : Exception("The household invitation was not found.");

public sealed class HouseholdInvitationUnavailableException()
    : Exception("This invitation is invalid, expired, revoked, or already accepted.");

public sealed class HouseholdInvitationEmailMismatchException()
    : Exception("Sign in with the email address that received this invitation.");
