using BudgetApp.Application.Households;
using BudgetApp.Domain.Dashboards;

namespace BudgetApp.Application.Dashboards;

public sealed class DashboardLayoutService(
    IDashboardLayoutRepository repository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<DashboardLayoutModel> GetAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        var layout = await repository.GetForUpdateAsync(
            householdId, userId, cancellationToken);
        return layout is null ? DefaultLayout() : ToModel(layout, isDefault: false);
    }

    public async Task<DashboardLayoutModel> SaveAsync(
        Guid householdId,
        Guid userId,
        int preferredColumnCount,
        IReadOnlyList<string> visiblePanelKeys,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        Validate(preferredColumnCount, visiblePanelKeys);
        var layout = await repository.GetForUpdateAsync(
            householdId, userId, cancellationToken);
        var now = timeProvider.GetUtcNow();
        if (layout is null)
        {
            layout = DashboardLayout.Create(
                householdId,
                userId,
                preferredColumnCount,
                visiblePanelKeys,
                now);
            await repository.AddAsync(layout, cancellationToken);
        }
        else
        {
            var existingPanelIds = layout.Panels
                .Select(panel => panel.Id)
                .ToHashSet();
            layout.Update(preferredColumnCount, visiblePanelKeys, now);
            repository.AddPanels(layout.Panels.Where(
                panel => !existingPanelIds.Contains(panel.Id)));
        }

        await repository.SaveChangesAsync(cancellationToken);
        return ToModel(layout, isDefault: false);
    }

    public async Task<DashboardLayoutModel> ResetAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        var layout = await repository.GetForUpdateAsync(
            householdId, userId, cancellationToken);
        if (layout is not null)
        {
            repository.Remove(layout);
            await repository.SaveChangesAsync(cancellationToken);
        }

        return DefaultLayout();
    }

    private static DashboardLayoutModel DefaultLayout() =>
        new(
            DashboardPanelCatalog.DefaultColumnCount,
            DashboardPanelCatalog.DefaultPanelKeys,
            IsDefault: true);

    private static DashboardLayoutModel ToModel(
        DashboardLayout layout,
        bool isDefault) =>
        new(
            layout.PreferredColumnCount,
            layout.Panels
                .OrderBy(panel => panel.DisplayOrder)
                .Select(panel => panel.PanelKey)
                .ToList(),
            isDefault);

    private static void Validate(
        int preferredColumnCount,
        IReadOnlyList<string> visiblePanelKeys)
    {
        ArgumentNullException.ThrowIfNull(visiblePanelKeys);
        if (preferredColumnCount is
            < DashboardPanelCatalog.MinimumColumnCount or
            > DashboardPanelCatalog.MaximumColumnCount)
        {
            throw new ArgumentOutOfRangeException(
                nameof(preferredColumnCount),
                $"Choose between {DashboardPanelCatalog.MinimumColumnCount} and " +
                $"{DashboardPanelCatalog.MaximumColumnCount} dashboard columns.");
        }

        if (visiblePanelKeys.Any(key =>
                string.IsNullOrWhiteSpace(key) ||
                !DashboardPanelCatalog.SupportedPanelKeys.Contains(
                    key.Trim().ToLowerInvariant())))
        {
            throw new ArgumentException(
                "The dashboard contains an unsupported panel.",
                nameof(visiblePanelKeys));
        }
    }
}
