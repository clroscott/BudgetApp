using BudgetApp.Domain.Auditing;

namespace BudgetApp.Application.Auditing;

public sealed record AuditEventInput(
    Guid HouseholdId,
    Guid ActorUserId,
    AuditVisibility Visibility,
    Guid? OwnerUserId,
    string Action,
    string EntityType,
    Guid EntityId,
    string Summary,
    IReadOnlyDictionary<string, string?>? Details = null);

public sealed record AuditEventRecord(
    Guid Id,
    Guid HouseholdId,
    Guid ActorUserId,
    string ActorDisplayName,
    AuditVisibility Visibility,
    Guid? OwnerUserId,
    DateTimeOffset OccurredAtUtc,
    string Action,
    string EntityType,
    Guid EntityId,
    string Summary,
    string? DetailsJson);

public sealed record AuditEventItem(
    Guid Id,
    Guid ActorUserId,
    string ActorDisplayName,
    string Visibility,
    DateTimeOffset OccurredAtUtc,
    string Action,
    string EntityType,
    Guid EntityId,
    string Summary,
    IReadOnlyDictionary<string, string?> Details);

public sealed record AuditActorOption(
    Guid UserId,
    string DisplayName);

public sealed record AuditFilterOptions(
    IReadOnlyList<AuditActorOption> Actors,
    IReadOnlyList<string> Actions,
    IReadOnlyList<string> EntityTypes);

public sealed record AuditEventListResult(
    IReadOnlyList<AuditEventItem> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages,
    AuditFilterOptions Filters);

public sealed record AuditEventQueryResult(
    IReadOnlyList<AuditEventRecord> Items,
    int TotalCount);

public static class AuditActions
{
    public const string Created = "Created";
    public const string Updated = "Updated";
    public const string Deleted = "Deleted";
    public const string Imported = "Imported";
    public const string Approved = "Approved";
    public const string Excluded = "Excluded";
    public const string Activated = "Activated";
    public const string Deactivated = "Deactivated";
    public const string Closed = "Closed";
    public const string Reopened = "Reopened";
    public const string ReturnedToDraft = "ReturnedToDraft";
    public const string Copied = "Copied";
    public const string Cleared = "Cleared";
    public const string Invited = "Invited";
    public const string Resent = "Resent";
    public const string Revoked = "Revoked";
    public const string Accepted = "Accepted";
    public const string Left = "Left";
}

public static class AuditEntityTypes
{
    public const string Transaction = "Transaction";
    public const string Import = "Import";
    public const string Budget = "Budget";
    public const string YearlyPlan = "YearlyPlan";
    public const string Account = "Account";
    public const string Category = "Category";
    public const string RecurringExpense = "RecurringExpense";
    public const string ImportProfile = "ImportProfile";
    public const string CategorizationRule = "CategorizationRule";
    public const string HouseholdMember = "HouseholdMember";
    public const string HouseholdInvitation = "HouseholdInvitation";
    public const string Household = "Household";
}
