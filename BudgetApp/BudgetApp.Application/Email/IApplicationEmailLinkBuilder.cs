namespace BudgetApp.Application.Email;

public interface IApplicationEmailLinkBuilder
{
    string BuildPasswordRecoveryLink(string token);

    string BuildHouseholdInvitationLink(string token);
}
