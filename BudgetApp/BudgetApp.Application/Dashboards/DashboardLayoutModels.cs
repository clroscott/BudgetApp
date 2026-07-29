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

    public static bool IsValidPanelKey(string? panelKey)
    {
        if (string.IsNullOrWhiteSpace(panelKey))
        {
            return false;
        }

        var normalized = panelKey.Trim().ToLowerInvariant();
        return normalized.Length <=
                BudgetApp.Domain.Dashboards.DashboardPanelPreference.PanelKeyMaxLength &&
            normalized[0] != '-' &&
            normalized[^1] != '-' &&
            !normalized.Contains("--", StringComparison.Ordinal) &&
            normalized.All(character =>
                char.IsAsciiLetterOrDigit(character) || character == '-');
    }
}
