using System.Text.Json;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Auditing;

namespace BudgetApp.Application.Auditing;

public sealed class AuditQueryService(
    IAuditRepository auditRepository,
    HouseholdAuthorizationService authorizationService)
{
    private const int PageSize = 50;

    public async Task<AuditEventListResult> ListAsync(
        Guid householdId,
        Guid userId,
        DateOnly? fromDate,
        DateOnly? toDate,
        Guid? actorUserId,
        string? action,
        string? entityType,
        int page,
        CancellationToken cancellationToken)
    {
        if (page < 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(page),
                "Page must be at least 1.");
        }

        if (fromDate.HasValue && toDate.HasValue && fromDate > toDate)
        {
            throw new ArgumentException(
                "The start date cannot be after the end date.");
        }

        action = NormalizeFilter(
            action,
            AuditEvent.ActionMaxLength,
            nameof(action));
        entityType = NormalizeFilter(
            entityType,
            AuditEvent.EntityTypeMaxLength,
            nameof(entityType));

        await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);

        DateTimeOffset? fromUtc = fromDate.HasValue
            ? new DateTimeOffset(
                fromDate.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc))
            : null;
        DateTimeOffset? toUtcExclusive = toDate.HasValue
            ? new DateTimeOffset(
                toDate.Value.AddDays(1)
                    .ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc))
            : null;
        var query = await auditRepository.ListVisibleAsync(
            householdId,
            userId,
            fromUtc,
            toUtcExclusive,
            actorUserId,
            action,
            entityType,
            (page - 1) * PageSize,
            PageSize,
            cancellationToken);
        var filters = await auditRepository.GetVisibleFilterOptionsAsync(
            householdId,
            userId,
            cancellationToken);
        var totalPages = query.TotalCount == 0
            ? 0
            : (int)Math.Ceiling(query.TotalCount / (double)PageSize);

        return new AuditEventListResult(
            query.Items.Select(ToItem).ToList(),
            page,
            PageSize,
            query.TotalCount,
            totalPages,
            filters);
    }

    private static AuditEventItem ToItem(AuditEventRecord record) =>
        new(
            record.Id,
            record.ActorUserId,
            record.ActorDisplayName,
            record.Visibility.ToString(),
            record.OccurredAtUtc,
            record.Action,
            record.EntityType,
            record.EntityId,
            record.Summary,
            DeserializeDetails(record.DetailsJson));

    private static IReadOnlyDictionary<string, string?> DeserializeDetails(
        string? detailsJson)
    {
        if (string.IsNullOrWhiteSpace(detailsJson))
        {
            return new Dictionary<string, string?>();
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string?>>(
                    detailsJson)
                ?? new Dictionary<string, string?>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, string?>();
        }
    }

    private static string? NormalizeFilter(
        string? value,
        int maximumLength,
        string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        if (normalized.Length > maximumLength)
        {
            throw new ArgumentException(
                $"Filter cannot exceed {maximumLength} characters.",
                parameterName);
        }

        return normalized;
    }
}
