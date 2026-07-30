namespace BudgetApp.Domain.Households;

public sealed class HouseholdInvitation
{
    public const int EmailMaxLength = 256;
    public const int TokenHashLength = 64;

    private HouseholdInvitation()
    {
    }

    private HouseholdInvitation(
        Guid id,
        Guid householdId,
        string email,
        string normalizedEmail,
        HouseholdRole role,
        string tokenHash,
        Guid invitedByUserId,
        DateTimeOffset createdAtUtc,
        DateTimeOffset expiresAtUtc)
    {
        Id = id;
        HouseholdId = householdId;
        Email = ValidateEmail(email);
        NormalizedEmail = ValidateEmail(normalizedEmail);
        Role = ValidateInvitableRole(role);
        TokenHash = ValidateTokenHash(tokenHash);
        InvitedByUserId = ValidateId(invitedByUserId, nameof(invitedByUserId));
        Status = HouseholdInvitationStatus.Pending;
        CreatedAtUtc = createdAtUtc;
        LastSentAtUtc = createdAtUtc;
        ExpiresAtUtc = ValidateExpiry(createdAtUtc, expiresAtUtc);
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public string Email { get; private set; } = string.Empty;

    public string NormalizedEmail { get; private set; } = string.Empty;

    public HouseholdRole Role { get; private set; }

    public HouseholdInvitationStatus Status { get; private set; }

    public string TokenHash { get; private set; } = string.Empty;

    public Guid InvitedByUserId { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset LastSentAtUtc { get; private set; }

    public DateTimeOffset ExpiresAtUtc { get; private set; }

    public DateTimeOffset? AcceptedAtUtc { get; private set; }

    public Guid? AcceptedByUserId { get; private set; }

    public DateTimeOffset? RevokedAtUtc { get; private set; }

    public Household Household { get; private set; } = null!;

    public bool IsExpired(DateTimeOffset nowUtc) =>
        Status == HouseholdInvitationStatus.Pending &&
        ExpiresAtUtc <= nowUtc;

    public static HouseholdInvitation Create(
        Guid householdId,
        string email,
        string normalizedEmail,
        HouseholdRole role,
        string tokenHash,
        Guid invitedByUserId,
        DateTimeOffset createdAtUtc,
        DateTimeOffset expiresAtUtc)
    {
        if (householdId == Guid.Empty)
        {
            throw new ArgumentException(
                "Household ID is required.",
                nameof(householdId));
        }

        return new HouseholdInvitation(
            Guid.NewGuid(),
            householdId,
            email,
            normalizedEmail,
            role,
            tokenHash,
            invitedByUserId,
            createdAtUtc,
            expiresAtUtc);
    }

    public void Resend(
        string tokenHash,
        Guid invitedByUserId,
        DateTimeOffset sentAtUtc,
        DateTimeOffset expiresAtUtc)
    {
        if (Status != HouseholdInvitationStatus.Pending)
        {
            throw new InvalidOperationException(
                "Only pending invitations can be resent.");
        }

        TokenHash = ValidateTokenHash(tokenHash);
        InvitedByUserId = ValidateId(invitedByUserId, nameof(invitedByUserId));
        LastSentAtUtc = sentAtUtc;
        ExpiresAtUtc = ValidateExpiry(sentAtUtc, expiresAtUtc);
    }

    public void Revoke(DateTimeOffset revokedAtUtc)
    {
        if (Status != HouseholdInvitationStatus.Pending)
        {
            throw new InvalidOperationException(
                "Only pending invitations can be revoked.");
        }

        Status = HouseholdInvitationStatus.Revoked;
        RevokedAtUtc = revokedAtUtc;
    }

    public void Accept(Guid userId, DateTimeOffset acceptedAtUtc)
    {
        if (Status != HouseholdInvitationStatus.Pending ||
            IsExpired(acceptedAtUtc))
        {
            throw new InvalidOperationException(
                "The invitation is not available for acceptance.");
        }

        Status = HouseholdInvitationStatus.Accepted;
        AcceptedByUserId = ValidateId(userId, nameof(userId));
        AcceptedAtUtc = acceptedAtUtc;
    }

    private static Guid ValidateId(Guid value, string parameterName) =>
        value == Guid.Empty
            ? throw new ArgumentException("ID is required.", parameterName)
            : value;

    private static string ValidateEmail(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var trimmed = value.Trim();
        if (trimmed.Length > EmailMaxLength)
        {
            throw new ArgumentException(
                $"Email cannot exceed {EmailMaxLength} characters.");
        }

        return trimmed;
    }

    private static HouseholdRole ValidateInvitableRole(HouseholdRole role) =>
        role is HouseholdRole.Admin or HouseholdRole.Editor or HouseholdRole.Viewer
            ? role
            : throw new ArgumentOutOfRangeException(
                nameof(role),
                "Owner is not an invitation role.");

    private static string ValidateTokenHash(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var trimmed = value.Trim();
        if (trimmed.Length != TokenHashLength ||
            trimmed.Any(character => !char.IsAsciiHexDigit(character)))
        {
            throw new ArgumentException(
                "Invitation token hash must be a SHA-256 hexadecimal value.",
                nameof(value));
        }

        return trimmed.ToUpperInvariant();
    }

    private static DateTimeOffset ValidateExpiry(
        DateTimeOffset issuedAtUtc,
        DateTimeOffset expiresAtUtc) =>
        expiresAtUtc <= issuedAtUtc
            ? throw new ArgumentException(
                "Invitation expiry must be after its issue time.",
                nameof(expiresAtUtc))
            : expiresAtUtc;
}
