using BudgetApp.Domain.Dashboards;

namespace BudgetApp.Application.Dashboards;

public interface IDashboardLayoutRepository
{
    Task<DashboardLayout?> GetForUpdateAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken);

    Task AddAsync(DashboardLayout layout, CancellationToken cancellationToken);

    void AddPanels(IEnumerable<DashboardPanelPreference> panels);

    void Remove(DashboardLayout layout);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
