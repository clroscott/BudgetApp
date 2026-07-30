using BudgetApp.Application.Auditing;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Households;
using Microsoft.Extensions.Logging;

namespace BudgetApp.Application.Households;

public sealed class HouseholdLifecycleService(
    IHouseholdLifecycleRepository repository,
    AuditWriter auditWriter,
    ILogger<HouseholdLifecycleService> logger)
{
    private const string OwnershipBlocked =
        "An Owner cannot leave while the household still exists. " +
        "Ownership transfer will be supported in a later phase.";

    private const string DataBlocked =
        "This household contains financial data or customized categories and " +
        "cannot be deleted as an unused household.";

    public async Task<HouseholdExitOptions> GetExitOptionsAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var membership = await repository.GetMembershipAsync(
                householdId,
                userId,
                tracked: false,
                cancellationToken)
            ?? throw new HouseholdAccessDeniedException();

        if (membership.Role != HouseholdRole.Owner)
        {
            return new HouseholdExitOptions(
                CanLeave: true,
                CanDeleteUnused: false,
                BlockedReason: null);
        }

        var memberCount = await repository.GetActiveMemberCountAsync(
            householdId,
            cancellationToken);
        if (memberCount != 1)
        {
            return new HouseholdExitOptions(
                CanLeave: false,
                CanDeleteUnused: false,
                BlockedReason: OwnershipBlocked);
        }

        var hasMeaningfulData = await repository.HasMeaningfulDataAsync(
            householdId,
            cancellationToken);
        var categoriesAreDefaults = await repository.CategoriesMatchDefaultsAsync(
            householdId,
            cancellationToken);
        if (hasMeaningfulData || !categoriesAreDefaults)
        {
            return new HouseholdExitOptions(
                CanLeave: false,
                CanDeleteUnused: false,
                BlockedReason: DataBlocked);
        }

        return new HouseholdExitOptions(
            CanLeave: false,
            CanDeleteUnused: true,
            BlockedReason: null);
    }

    public async Task LeaveAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var membership = await repository.GetMembershipAsync(
                householdId,
                userId,
                tracked: true,
                cancellationToken)
            ?? throw new HouseholdAccessDeniedException();

        if (membership.Role == HouseholdRole.Owner)
        {
            throw new HouseholdExitNotAllowedException(OwnershipBlocked);
        }

        auditWriter.Record(new AuditEventInput(
            householdId,
            userId,
            AuditVisibility.Household,
            null,
            AuditActions.Left,
            AuditEntityTypes.HouseholdMember,
            membership.Id,
            $"Left the household as {membership.Role}."));
        repository.RemoveMember(membership);
        await repository.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteUnusedAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var options = await GetExitOptionsAsync(
            householdId,
            userId,
            cancellationToken);
        if (!options.CanDeleteUnused)
        {
            throw new HouseholdExitNotAllowedException(
                options.BlockedReason ?? DataBlocked);
        }

        await repository.DeleteUnusedHouseholdAsync(
            householdId,
            userId,
            cancellationToken);
        logger.LogWarning(
            "Deleted unused household {HouseholdId} at the request of owner {UserId}",
            householdId,
            userId);
    }
}
