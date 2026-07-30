using System.Data;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Households;

internal sealed class HouseholdLifecycleRepository(
    BudgetAppDbContext dbContext) : IHouseholdLifecycleRepository
{
    public Task<HouseholdMember?> GetMembershipAsync(
        Guid householdId,
        Guid userId,
        bool tracked,
        CancellationToken cancellationToken)
    {
        var query = dbContext.HouseholdMembers
            .Where(member =>
                member.HouseholdId == householdId &&
                member.UserId == userId &&
                member.Status == HouseholdMemberStatus.Active &&
                member.Household.IsActive);
        return (tracked ? query : query.AsNoTracking())
            .SingleOrDefaultAsync(cancellationToken);
    }

    public Task<int> GetActiveMemberCountAsync(
        Guid householdId,
        CancellationToken cancellationToken) =>
        dbContext.HouseholdMembers.CountAsync(
            member =>
                member.HouseholdId == householdId &&
                member.Status == HouseholdMemberStatus.Active,
            cancellationToken);

    public async Task<bool> HasMeaningfulDataAsync(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Accounts.AnyAsync(
                   item => item.HouseholdId == householdId,
                   cancellationToken) ||
               await dbContext.Transactions.AnyAsync(
                   item => item.HouseholdId == householdId,
                   cancellationToken) ||
               await dbContext.ImportFiles.AnyAsync(
                   item => item.HouseholdId == householdId,
                   cancellationToken) ||
               await dbContext.BudgetMonths.AnyAsync(
                   item => item.HouseholdId == householdId,
                   cancellationToken) ||
               await dbContext.RecurringExpenses.AnyAsync(
                   item => item.HouseholdId == householdId,
                   cancellationToken) ||
               await dbContext.CategorizationRules.AnyAsync(
                   item => item.HouseholdId == householdId,
                   cancellationToken) ||
               await dbContext.ImportProfiles.AnyAsync(
                   item => item.HouseholdId == householdId,
                   cancellationToken);
    }

    public async Task<bool> CategoriesMatchDefaultsAsync(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        var actual = await dbContext.Categories
            .AsNoTracking()
            .Where(category => category.HouseholdId == householdId)
            .ToListAsync(cancellationToken);
        var expectedRoots = DefaultCategoryCatalog.CreateForHousehold(
            householdId,
            DateTimeOffset.UnixEpoch);
        var expectedCount = expectedRoots.Sum(root => 1 + root.Children.Count);

        if (actual.Count != expectedCount)
        {
            return false;
        }

        foreach (var expectedRoot in expectedRoots)
        {
            var actualRoot = actual.SingleOrDefault(category =>
                category.ParentCategoryId is null &&
                category.NormalizedName == expectedRoot.NormalizedName);
            if (!Matches(actualRoot, expectedRoot))
            {
                return false;
            }

            foreach (var expectedChild in expectedRoot.Children)
            {
                var actualChild = actual.SingleOrDefault(category =>
                    category.ParentCategoryId == actualRoot!.Id &&
                    category.NormalizedName == expectedChild.NormalizedName);
                if (!Matches(actualChild, expectedChild))
                {
                    return false;
                }
            }
        }

        return true;
    }

    public void RemoveMember(HouseholdMember member) =>
        dbContext.HouseholdMembers.Remove(member);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);

    public async Task DeleteUnusedHouseholdAsync(
        Guid householdId,
        Guid ownerUserId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        var owner = await GetMembershipAsync(
            householdId,
            ownerUserId,
            tracked: false,
            cancellationToken);
        var activeMemberCount = await GetActiveMemberCountAsync(
            householdId,
            cancellationToken);
        if (owner?.Role != HouseholdRole.Owner ||
            activeMemberCount != 1 ||
            await HasMeaningfulDataAsync(householdId, cancellationToken) ||
            !await CategoriesMatchDefaultsAsync(householdId, cancellationToken))
        {
            throw new HouseholdExitNotAllowedException(
                "The household changed and is no longer eligible for unused-household deletion.");
        }

        await dbContext.AuditEvents
            .Where(item => item.HouseholdId == householdId)
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.HouseholdInvitations
            .Where(item => item.HouseholdId == householdId)
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.DashboardLayouts
            .Where(item => item.HouseholdId == householdId)
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.Categories
            .Where(item =>
                item.HouseholdId == householdId &&
                item.ParentCategoryId != null)
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.Categories
            .Where(item =>
                item.HouseholdId == householdId &&
                item.ParentCategoryId == null)
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.HouseholdMembers
            .Where(item => item.HouseholdId == householdId)
            .ExecuteDeleteAsync(cancellationToken);
        var deleted = await dbContext.Households
            .Where(item => item.Id == householdId)
            .ExecuteDeleteAsync(cancellationToken);
        if (deleted != 1)
        {
            throw new HouseholdAccessDeniedException();
        }

        await transaction.CommitAsync(cancellationToken);
    }

    private static bool Matches(Category? actual, Category expected) =>
        actual is not null &&
        actual.NormalizedName == expected.NormalizedName &&
        actual.Type == expected.Type &&
        actual.DisplayOrder == expected.DisplayOrder &&
        actual.IsActive;
}
