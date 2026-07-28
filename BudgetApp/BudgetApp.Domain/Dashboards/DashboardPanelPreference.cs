namespace BudgetApp.Domain.Dashboards;

public sealed class DashboardPanelPreference
{
    public const int PanelKeyMaxLength = 60;

    private DashboardPanelPreference()
    {
    }

    private DashboardPanelPreference(
        Guid id,
        Guid dashboardLayoutId,
        string panelKey,
        int displayOrder)
    {
        Id = id;
        DashboardLayoutId = dashboardLayoutId;
        PanelKey = NormalizeKey(panelKey);
        DisplayOrder = displayOrder;
    }

    public Guid Id { get; private set; }

    public Guid DashboardLayoutId { get; private set; }

    public string PanelKey { get; private set; } = string.Empty;

    public int DisplayOrder { get; private set; }

    internal static DashboardPanelPreference Create(
        Guid dashboardLayoutId,
        string panelKey,
        int displayOrder) =>
        new(Guid.NewGuid(), dashboardLayoutId, panelKey, displayOrder);

    internal void SetDisplayOrder(int displayOrder)
    {
        if (displayOrder < 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(displayOrder),
                "Dashboard panel display order cannot be negative.");
        }

        DisplayOrder = displayOrder;
    }

    internal static string NormalizeKey(string panelKey)
    {
        if (string.IsNullOrWhiteSpace(panelKey))
        {
            throw new ArgumentException("Dashboard panel key is required.", nameof(panelKey));
        }

        var normalized = panelKey.Trim().ToLowerInvariant();
        if (normalized.Length > PanelKeyMaxLength)
        {
            throw new ArgumentException(
                $"Dashboard panel key cannot exceed {PanelKeyMaxLength} characters.",
                nameof(panelKey));
        }

        return normalized;
    }
}
