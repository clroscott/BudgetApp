namespace BudgetApp.Application.Dashboards;

public sealed record DashboardLayoutModel(
    int PreferredColumnCount,
    IReadOnlyList<string> VisiblePanelKeys,
    bool IsDefault);

public static class DashboardPanelCatalog
{
    public const int DefaultColumnCount = 3;
    public const int MinimumColumnCount = 2;
    public const int MaximumColumnCount = 4;

    public static readonly IReadOnlyList<string> DefaultPanelKeys =
    [
        "monthly-budget",
        "transactions",
        "import-review",
        "recurring-expenses",
        "accounts",
        "categories",
        "household"
    ];

    public static readonly IReadOnlySet<string> SupportedPanelKeys =
        DefaultPanelKeys.ToHashSet(StringComparer.Ordinal);
}
