using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed record HouseholdMemberItem(
    Guid UserId,
    string DisplayName,
    string Email,
    HouseholdRole Role,
    HouseholdMemberStatus Status,
    DateTimeOffset? JoinedAtUtc);

public sealed record HouseholdInvitationItem(
    Guid Id,
    string Email,
    HouseholdRole Role,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset LastSentAtUtc,
    DateTimeOffset ExpiresAtUtc);

public sealed record HouseholdMemberManagement(
    bool CanManageInvitations,
    IReadOnlyList<HouseholdMemberItem> Members,
    IReadOnlyList<HouseholdInvitationItem> Invitations,
    HouseholdExitOptions ExitOptions);

public sealed record HouseholdInvitationPreview(
    string HouseholdName,
    string InviterDisplayName,
    string MaskedEmail,
    HouseholdRole Role,
    DateTimeOffset ExpiresAtUtc,
    bool IsAvailable,
    string Status);

public sealed record HouseholdInvitationDispatch(
    HouseholdInvitationItem Invitation,
    bool EmailDelivered);

public sealed record HouseholdInvitationToken(
    string RawToken,
    string TokenHash);
