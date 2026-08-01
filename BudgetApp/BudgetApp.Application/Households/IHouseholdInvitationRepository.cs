using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public interface IHouseholdInvitationRepository
{
    Task<IReadOnlyList<HouseholdMemberItem>> GetMembersAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<HouseholdInvitation>> GetInvitationsAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<HouseholdInvitation?> GetInvitationAsync(
        Guid householdId,
        Guid invitationId,
        CancellationToken cancellationToken);

    Task<HouseholdInvitation?> GetPendingInvitationByEmailAsync(
        Guid householdId,
        string normalizedEmail,
        CancellationToken cancellationToken);

    Task<HouseholdInvitation?> GetTrackedByTokenHashAsync(
        string tokenHash,
        CancellationToken cancellationToken);

    Task<HouseholdInvitationPreviewRecord?> GetPreviewByTokenHashAsync(
        string tokenHash,
        CancellationToken cancellationToken);

    Task<bool> HasMemberWithEmailAsync(
        Guid householdId,
        string normalizedEmail,
        CancellationToken cancellationToken);

    Task<UserEmailRecord?> GetUserEmailAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task<string?> GetHouseholdNameAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<string?> GetUserDisplayNameAsync(
        Guid userId,
        CancellationToken cancellationToken);

    void Add(HouseholdInvitation invitation);

    void AddMember(HouseholdMember member);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public sealed record HouseholdInvitationPreviewRecord(
    string HouseholdName,
    string InviterDisplayName,
    string Email,
    HouseholdRole Role,
    HouseholdInvitationStatus Status,
    DateTimeOffset ExpiresAtUtc);

public sealed record UserEmailRecord(
    string Email,
    string NormalizedEmail);
