namespace BudgetApp.Domain.Households;

public sealed class HouseholdMember
{
    private HouseholdMember()
    {
    }

    private HouseholdMember(
        Guid id,
        Guid householdId,
        Guid userId,
        HouseholdRole role,
        HouseholdMemberStatus status,
        DateTimeOffset joinedAtUtc,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = householdId;
        UserId = userId;
        Role = role;
        Status = status;
        JoinedAtUtc = joinedAtUtc;
        CreatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public Guid UserId { get; private set; }

    public HouseholdRole Role { get; private set; }

    public HouseholdMemberStatus Status { get; private set; }

    public DateTimeOffset? JoinedAtUtc { get; private set; }

    public Guid? InvitedByUserId { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public Household Household { get; private set; } = null!;

    internal static HouseholdMember CreateOwner(
        Guid householdId,
        Guid userId,
        DateTimeOffset createdAtUtc)
    {
        if (householdId == Guid.Empty)
        {
            throw new ArgumentException("Household ID is required.", nameof(householdId));
        }

        if (userId == Guid.Empty)
        {
            throw new ArgumentException("Owner user ID is required.", nameof(userId));
        }

        return new HouseholdMember(
            Guid.NewGuid(),
            householdId,
            userId,
            HouseholdRole.Owner,
            HouseholdMemberStatus.Active,
            createdAtUtc,
            createdAtUtc);
    }

    internal static HouseholdMember CreateInvitedMember(
        Guid householdId,
        Guid userId,
        HouseholdRole role,
        Guid invitedByUserId,
        DateTimeOffset joinedAtUtc)
    {
        if (householdId == Guid.Empty || userId == Guid.Empty ||
            invitedByUserId == Guid.Empty)
        {
            throw new ArgumentException("Household member IDs are required.");
        }

        if (role is HouseholdRole.Owner)
        {
            throw new ArgumentOutOfRangeException(
                nameof(role),
                "An invited member cannot become the household owner.");
        }

        return new HouseholdMember(
            Guid.NewGuid(),
            householdId,
            userId,
            role,
            HouseholdMemberStatus.Active,
            joinedAtUtc,
            joinedAtUtc)
        {
            InvitedByUserId = invitedByUserId
        };
    }
}
