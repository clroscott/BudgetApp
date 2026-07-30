using BudgetApp.Application.Auditing;
using BudgetApp.Domain.Auditing;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Auditing;

internal sealed class AuditRepository(BudgetAppDbContext dbContext)
    : IAuditRepository
{
    public void Add(AuditEvent auditEvent) =>
        dbContext.AuditEvents.Add(auditEvent);

    public async Task<AuditEventQueryResult> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        DateTimeOffset? fromUtc,
        DateTimeOffset? toUtcExclusive,
        Guid? actorUserId,
        string? action,
        string? entityType,
        int skip,
        int take,
        CancellationToken cancellationToken)
    {
        var visible = Visible(householdId, userId);
        if (fromUtc.HasValue)
        {
            visible = visible.Where(auditEvent =>
                auditEvent.OccurredAtUtc >= fromUtc.Value);
        }

        if (toUtcExclusive.HasValue)
        {
            visible = visible.Where(auditEvent =>
                auditEvent.OccurredAtUtc < toUtcExclusive.Value);
        }

        if (actorUserId.HasValue)
        {
            visible = visible.Where(auditEvent =>
                auditEvent.ActorUserId == actorUserId.Value);
        }

        if (action is not null)
        {
            visible = visible.Where(auditEvent =>
                auditEvent.Action == action);
        }

        if (entityType is not null)
        {
            visible = visible.Where(auditEvent =>
                auditEvent.EntityType == entityType);
        }
        var totalCount = await visible.CountAsync(cancellationToken);
        var items = await (
                from auditEvent in visible
                join actor in dbContext.Users.AsNoTracking()
                    on auditEvent.ActorUserId equals actor.Id into actors
                from actor in actors.DefaultIfEmpty()
                orderby auditEvent.OccurredAtUtc descending, auditEvent.Id
                select new AuditEventRecord(
                    auditEvent.Id,
                    auditEvent.HouseholdId,
                    auditEvent.ActorUserId,
                    actor == null ? "Former household member" : actor.DisplayName,
                    auditEvent.Visibility,
                    auditEvent.OwnerUserId,
                    auditEvent.OccurredAtUtc,
                    auditEvent.Action,
                    auditEvent.EntityType,
                    auditEvent.EntityId,
                    auditEvent.Summary,
                    auditEvent.DetailsJson))
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

        return new AuditEventQueryResult(items, totalCount);
    }

    public async Task<AuditFilterOptions> GetVisibleFilterOptionsAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var visible = Visible(householdId, userId);
        var actorIds = visible.Select(auditEvent => auditEvent.ActorUserId);
        var actors = await dbContext.Users
            .AsNoTracking()
            .Where(user => actorIds.Contains(user.Id))
            .OrderBy(user => user.DisplayName)
            .Select(user => new AuditActorOption(user.Id, user.DisplayName))
            .ToListAsync(cancellationToken);
        var actions = await visible
            .Select(auditEvent => auditEvent.Action)
            .Distinct()
            .OrderBy(action => action)
            .ToListAsync(cancellationToken);
        var entityTypes = await visible
            .Select(auditEvent => auditEvent.EntityType)
            .Distinct()
            .OrderBy(entityType => entityType)
            .ToListAsync(cancellationToken);

        return new AuditFilterOptions(actors, actions, entityTypes);
    }

    private IQueryable<AuditEvent> Visible(Guid householdId, Guid userId) =>
        dbContext.AuditEvents
            .AsNoTracking()
            .Where(auditEvent =>
                (auditEvent.HouseholdId == householdId &&
                    auditEvent.Visibility == AuditVisibility.Household) ||
                (auditEvent.HouseholdId == householdId &&
                    auditEvent.Visibility == AuditVisibility.Personal &&
                    auditEvent.OwnerUserId == userId));
}
