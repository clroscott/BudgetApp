namespace BudgetApp.Application.Dashboards;

public interface IDashboardSummaryRepository
{
    Task<DashboardActivityRecord> GetActivityAsync(
        Guid householdId, Guid userId, int year, int month, string scope,
        string currency, bool includeRecent, CancellationToken cancellationToken);
}
