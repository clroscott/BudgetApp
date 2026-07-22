using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public interface IHouseholdRepository
{
    Task<IReadOnlyList<HouseholdMembership>> GetActiveMembershipsAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task<bool> HasActiveMembershipAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task AddAsync(
        Household household,
        IReadOnlyCollection<Category> initialCategoryRoots,
        CancellationToken cancellationToken);
}
