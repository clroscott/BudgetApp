using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public interface IHouseholdLifecycleRepository
{
    Task<HouseholdMember?> GetMembershipAsync(
        Guid householdId,
        Guid userId,
        bool tracked,
        CancellationToken cancellationToken);

    Task<int> GetActiveMemberCountAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<bool> HasMeaningfulDataAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<bool> CategoriesMatchDefaultsAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    void RemoveMember(HouseholdMember member);

    Task SaveChangesAsync(CancellationToken cancellationToken);

    Task DeleteUnusedHouseholdAsync(
        Guid householdId,
        Guid ownerUserId,
        CancellationToken cancellationToken);
}
