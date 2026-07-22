using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed class HouseholdAuthorizationService(
    IHouseholdAuthorizationRepository authorizationRepository)
{
    public async Task<HouseholdRole> RequireViewAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var role = await authorizationRepository.GetActiveRoleAsync(
            householdId,
            userId,
            cancellationToken);

        return role ?? throw new HouseholdAccessDeniedException();
    }

    public async Task RequireEditAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var role = await RequireViewAsync(householdId, userId, cancellationToken);
        if (role == HouseholdRole.Viewer)
        {
            throw new HouseholdAccessDeniedException();
        }
    }
}
