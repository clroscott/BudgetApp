using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Households;

internal sealed class HouseholdInvitationRepository(
    BudgetAppDbContext dbContext) : IHouseholdInvitationRepository
{
    public async Task<IReadOnlyList<HouseholdMemberItem>> GetMembersAsync(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        return await dbContext.HouseholdMembers
            .AsNoTracking()
            .Where(member => member.HouseholdId == householdId)
            .Join(
                dbContext.Users,
                member => member.UserId,
                user => user.Id,
                (member, user) => new { Member = member, User = user })
            .OrderBy(item => item.Member.Role)
            .ThenBy(item => item.User.DisplayName)
            .Select(item => new HouseholdMemberItem(
                item.Member.UserId,
                item.User.DisplayName,
                item.User.Email ?? string.Empty,
                item.Member.Role,
                item.Member.Status,
                item.Member.JoinedAtUtc))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<HouseholdInvitation>> GetInvitationsAsync(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        var invitations = await dbContext.HouseholdInvitations
            .AsNoTracking()
            .Where(invitation => invitation.HouseholdId == householdId)
            .ToListAsync(cancellationToken);
        return invitations
            .OrderBy(invitation =>
                invitation.Status == HouseholdInvitationStatus.Pending ? 0 : 1)
            .ThenByDescending(invitation => invitation.LastSentAtUtc)
            .ToList();
    }

    public Task<HouseholdInvitation?> GetInvitationAsync(
        Guid householdId,
        Guid invitationId,
        CancellationToken cancellationToken)
    {
        return dbContext.HouseholdInvitations.SingleOrDefaultAsync(
            invitation =>
                invitation.Id == invitationId &&
                invitation.HouseholdId == householdId,
            cancellationToken);
    }

    public Task<HouseholdInvitation?> GetPendingInvitationByEmailAsync(
        Guid householdId,
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        return dbContext.HouseholdInvitations.SingleOrDefaultAsync(
            invitation =>
                invitation.HouseholdId == householdId &&
                invitation.NormalizedEmail == normalizedEmail &&
                invitation.Status == HouseholdInvitationStatus.Pending,
            cancellationToken);
    }

    public Task<HouseholdInvitation?> GetTrackedByTokenHashAsync(
        string tokenHash,
        CancellationToken cancellationToken)
    {
        return dbContext.HouseholdInvitations
            .Include(invitation => invitation.Household)
            .ThenInclude(household => household.Members)
            .SingleOrDefaultAsync(
                invitation => invitation.TokenHash == tokenHash,
                cancellationToken);
    }

    public Task<HouseholdInvitationPreviewRecord?> GetPreviewByTokenHashAsync(
        string tokenHash,
        CancellationToken cancellationToken)
    {
        return dbContext.HouseholdInvitations
            .AsNoTracking()
            .Where(invitation => invitation.TokenHash == tokenHash)
            .Join(
                dbContext.Users,
                invitation => invitation.InvitedByUserId,
                user => user.Id,
                (invitation, user) => new HouseholdInvitationPreviewRecord(
                    invitation.Household.Name,
                    user.DisplayName,
                    invitation.Email,
                    invitation.Role,
                    invitation.Status,
                    invitation.ExpiresAtUtc))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public Task<bool> HasMemberWithEmailAsync(
        Guid householdId,
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        return dbContext.HouseholdMembers
            .Where(member => member.HouseholdId == householdId)
            .Join(
                dbContext.Users,
                member => member.UserId,
                user => user.Id,
                (member, user) => user)
            .AnyAsync(
                user => user.NormalizedEmail == normalizedEmail,
                cancellationToken);
    }

    public Task<UserEmailRecord?> GetUserEmailAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        return dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new UserEmailRecord(
                user.Email ?? string.Empty,
                user.NormalizedEmail ?? string.Empty))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public Task<string?> GetHouseholdNameAsync(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        return dbContext.Households
            .AsNoTracking()
            .Where(household => household.Id == householdId)
            .Select(household => household.Name)
            .SingleOrDefaultAsync(cancellationToken);
    }

    public Task<string?> GetUserDisplayNameAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        return dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => user.DisplayName)
            .SingleOrDefaultAsync(cancellationToken);
    }

    public void Add(HouseholdInvitation invitation) =>
        dbContext.HouseholdInvitations.Add(invitation);

    public void AddMember(HouseholdMember member) =>
        dbContext.HouseholdMembers.Add(member);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
