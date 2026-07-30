namespace BudgetApp.Domain.Auditing;

public sealed class AuditEvent
{
    public const int ActionMaxLength = 100;
    public const int EntityTypeMaxLength = 100;
    public const int SummaryMaxLength = 500;

    private AuditEvent()
    {
    }

    private AuditEvent(
        Guid id,
        Guid householdId,
        Guid actorUserId,
        AuditVisibility visibility,
        Guid? ownerUserId,
        DateTimeOffset occurredAtUtc,
        string action,
        string entityType,
        Guid entityId,
        string summary,
        string? detailsJson)
    {
        Id = ValidateId(id, nameof(id));
        HouseholdId = ValidateId(householdId, nameof(householdId));
        ActorUserId = ValidateId(actorUserId, nameof(actorUserId));
        Visibility = ValidateVisibility(visibility);
        OwnerUserId = ValidateOwner(visibility, ownerUserId);
        OccurredAtUtc = occurredAtUtc;
        Action = ValidateText(action, ActionMaxLength, nameof(action));
        EntityType = ValidateText(
            entityType,
            EntityTypeMaxLength,
            nameof(entityType));
        EntityId = ValidateId(entityId, nameof(entityId));
        Summary = ValidateText(summary, SummaryMaxLength, nameof(summary));
        DetailsJson = string.IsNullOrWhiteSpace(detailsJson)
            ? null
            : detailsJson;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public Guid ActorUserId { get; private set; }

    public AuditVisibility Visibility { get; private set; }

    public Guid? OwnerUserId { get; private set; }

    public DateTimeOffset OccurredAtUtc { get; private set; }

    public string Action { get; private set; } = string.Empty;

    public string EntityType { get; private set; } = string.Empty;

    public Guid EntityId { get; private set; }

    public string Summary { get; private set; } = string.Empty;

    public string? DetailsJson { get; private set; }

    public static AuditEvent Create(
        Guid householdId,
        Guid actorUserId,
        AuditVisibility visibility,
        Guid? ownerUserId,
        DateTimeOffset occurredAtUtc,
        string action,
        string entityType,
        Guid entityId,
        string summary,
        string? detailsJson = null) =>
        new(
            Guid.NewGuid(),
            householdId,
            actorUserId,
            visibility,
            ownerUserId,
            occurredAtUtc,
            action,
            entityType,
            entityId,
            summary,
            detailsJson);

    private static Guid ValidateId(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("ID is required.", parameterName);
        }

        return value;
    }

    private static AuditVisibility ValidateVisibility(AuditVisibility value) =>
        Enum.IsDefined(value)
            ? value
            : throw new ArgumentOutOfRangeException(
                nameof(value),
                "Audit visibility is not supported.");

    private static Guid? ValidateOwner(
        AuditVisibility visibility,
        Guid? ownerUserId)
    {
        if (visibility == AuditVisibility.Personal)
        {
            if (!ownerUserId.HasValue || ownerUserId == Guid.Empty)
            {
                throw new ArgumentException(
                    "A personal audit event requires an owner.",
                    nameof(ownerUserId));
            }

            return ownerUserId;
        }

        if (ownerUserId.HasValue)
        {
            throw new ArgumentException(
                "A household audit event cannot have a personal owner.",
                nameof(ownerUserId));
        }

        return null;
    }

    private static string ValidateText(
        string value,
        int maximumLength,
        string parameterName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value, parameterName);
        var trimmed = value.Trim();
        if (trimmed.Length > maximumLength)
        {
            throw new ArgumentException(
                $"Value cannot exceed {maximumLength} characters.",
                parameterName);
        }

        return trimmed;
    }
}
