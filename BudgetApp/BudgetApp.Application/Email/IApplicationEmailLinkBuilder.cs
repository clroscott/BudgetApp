namespace BudgetApp.Application.Email;

public interface IApplicationEmailLinkBuilder
{
    string BuildPasswordRecoveryLink(Guid userId, string token);

    string BuildHouseholdInvitationLink(string token);

    string BuildEmailConfirmationLink(Guid userId, string token, bool changeEmail);
    string BuildOperatorMfaRecoveryLink(Guid userId, string token);
}
