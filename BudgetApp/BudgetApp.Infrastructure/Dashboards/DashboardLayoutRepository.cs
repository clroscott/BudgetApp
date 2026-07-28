using BudgetApp.Application.Dashboards;
using BudgetApp.Domain.Dashboards;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Dashboards;

internal sealed class DashboardLayoutRepository(BudgetAppDbContext dbContext)
    : IDashboardLayoutRepository
{
    public Task<DashboardLayout?> GetForUpdateAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken) =>
        dbContext.DashboardLayouts
            .Include(layout => layout.Panels)
            .SingleOrDefaultAsync(
                layout =>
                    layout.HouseholdId == householdId &&
                    layout.UserId == userId,
                cancellationToken);

    public Task AddAsync(
        DashboardLayout layout,
        CancellationToken cancellationToken) =>
        dbContext.DashboardLayouts.AddAsync(layout, cancellationToken).AsTask();

    public void AddPanels(IEnumerable<DashboardPanelPreference> panels) =>
        dbContext.DashboardPanelPreferences.AddRange(panels);

    public void Remove(DashboardLayout layout) =>
        dbContext.DashboardLayouts.Remove(layout);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
