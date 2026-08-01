using BudgetApp.Application.Households;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Households;

internal sealed class HouseholdRepository(BudgetAppDbContext dbContext)
    : IHouseholdRepository
{
    public async Task<IReadOnlyList<HouseholdMembership>> GetActiveMembershipsAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        return await dbContext.HouseholdMembers
            .AsNoTracking()
            .Where(member =>
                member.UserId == userId &&
                member.Status == HouseholdMemberStatus.Active &&
                member.Household.IsActive)
            .OrderBy(member => member.Household.Name)
            .Select(member => new HouseholdMembership(
                member.HouseholdId,
                member.Household.Name,
                member.Household.DefaultCurrency,
                member.Household.TimeZoneId,
                member.Role))
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(
        Household household,
        IReadOnlyCollection<Category> initialCategoryRoots,
        CancellationToken cancellationToken)
    {
        dbContext.Households.Add(household);
        dbContext.Categories.AddRange(initialCategoryRoots);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
