using BudgetApp.Domain.Auditing;

namespace BudgetApp.Application.Auditing;

public interface IAuditRepository
{
    void Add(AuditEvent auditEvent);

    Task<AuditEventQueryResult> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        DateTimeOffset? fromUtc,
        DateTimeOffset? toUtcExclusive,
        Guid? actorUserId,
        string? action,
        string? entityType,
        int skip,
        int take,
        CancellationToken cancellationToken);

    Task<AuditFilterOptions> GetVisibleFilterOptionsAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken);
}
