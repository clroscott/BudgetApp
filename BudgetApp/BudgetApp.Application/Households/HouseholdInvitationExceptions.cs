namespace BudgetApp.Application.Households;

public sealed class HouseholdInvitationConflictException(string message)
    : Exception(message);

public sealed class HouseholdInvitationNotFoundException()
    : Exception("The household invitation was not found.");

public sealed class HouseholdInvitationUnavailableException()
    : Exception("This invitation is invalid, expired, revoked, or already accepted.");

public sealed class HouseholdInvitationEmailMismatchException()
    : Exception("Sign in with the email address that received this invitation.");

public sealed class MultipleHouseholdsNotSupportedException()
    : Exception(
        "This account already belongs to a household. Multiple households are not supported yet.");
