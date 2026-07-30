namespace BudgetApp.Application.Email;

public interface IApplicationEmailLinkBuilder
{
    string BuildPasswordRecoveryLink(Guid userId, string token);

    string BuildHouseholdInvitationLink(string token);
}
