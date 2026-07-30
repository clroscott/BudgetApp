using System.Text.Json;
using BudgetApp.Domain.Auditing;

namespace BudgetApp.Application.Auditing;

public sealed class AuditWriter(
    IAuditRepository auditRepository,
    TimeProvider timeProvider)
{
    public Guid Record(AuditEventInput input)
    {
        var detailsJson = input.Details is { Count: > 0 }
            ? JsonSerializer.Serialize(input.Details)
            : null;
        var auditEvent = AuditEvent.Create(
            input.HouseholdId,
            input.ActorUserId,
            input.Visibility,
            input.OwnerUserId,
            timeProvider.GetUtcNow(),
            input.Action,
            input.EntityType,
            input.EntityId,
            input.Summary,
            detailsJson);
        auditRepository.Add(auditEvent);
        return auditEvent.Id;
    }
}
