using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public interface IHouseholdAuthorizationRepository
{
    Task<HouseholdRole?> GetActiveRoleAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken);
}
