using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Households;

internal sealed class HouseholdAuthorizationRepository(BudgetAppDbContext dbContext)
    : IHouseholdAuthorizationRepository
{
    public Task<HouseholdRole?> GetActiveRoleAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        return dbContext.HouseholdMembers
            .AsNoTracking()
            .Where(member =>
                member.HouseholdId == householdId &&
                member.UserId == userId &&
                member.Status == HouseholdMemberStatus.Active &&
                member.Household.IsActive)
            .Select(member => (HouseholdRole?)member.Role)
            .SingleOrDefaultAsync(cancellationToken);
    }
}
