namespace BudgetApp.Application.Households;

public interface IHouseholdInvitationTokenService
{
    HouseholdInvitationToken Create();

    string Hash(string rawToken);
}
