namespace BudgetApp.Domain.Dashboards;

public sealed class DashboardLayout
{
    private readonly List<DashboardPanelPreference> _panels = [];

    private DashboardLayout()
    {
    }

    private DashboardLayout(
        Guid id,
        Guid householdId,
        Guid userId,
        int preferredColumnCount,
        IReadOnlyList<string> visiblePanelKeys,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = ValidateId(householdId, nameof(householdId));
        UserId = ValidateId(userId, nameof(userId));
        SetPreferences(preferredColumnCount, visiblePanelKeys, createdAtUtc);
        CreatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public Guid UserId { get; private set; }

    public int PreferredColumnCount { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public IReadOnlyCollection<DashboardPanelPreference> Panels => _panels;

    public static DashboardLayout Create(
        Guid householdId,
        Guid userId,
        int preferredColumnCount,
        IReadOnlyList<string> visiblePanelKeys,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            userId,
            preferredColumnCount,
            visiblePanelKeys,
            createdAtUtc);

    public void Update(
        int preferredColumnCount,
        IReadOnlyList<string> visiblePanelKeys,
        DateTimeOffset updatedAtUtc) =>
        SetPreferences(preferredColumnCount, visiblePanelKeys, updatedAtUtc);

    private void SetPreferences(
        int preferredColumnCount,
        IReadOnlyList<string> visiblePanelKeys,
        DateTimeOffset updatedAtUtc)
    {
        ArgumentNullException.ThrowIfNull(visiblePanelKeys);
        if (preferredColumnCount < 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(preferredColumnCount),
                "Dashboard column count must be positive.");
        }

        var normalizedKeys = visiblePanelKeys
            .Select(DashboardPanelPreference.NormalizeKey)
            .ToList();
        if (normalizedKeys.Count != normalizedKeys.Distinct(StringComparer.Ordinal).Count())
        {
            throw new ArgumentException(
                "A dashboard panel can appear only once.",
                nameof(visiblePanelKeys));
        }

        PreferredColumnCount = preferredColumnCount;
        _panels.RemoveAll(panel => !normalizedKeys.Contains(
            panel.PanelKey,
            StringComparer.Ordinal));
        for (var index = 0; index < normalizedKeys.Count; index++)
        {
            var panel = _panels.SingleOrDefault(
                item => item.PanelKey == normalizedKeys[index]);
            if (panel is null)
            {
                _panels.Add(DashboardPanelPreference.Create(
                    Id,
                    normalizedKeys[index],
                    index));
            }
            else
            {
                panel.SetDisplayOrder(index);
            }
        }

        UpdatedAtUtc = updatedAtUtc;
    }

    private static Guid ValidateId(Guid id, string parameterName)
    {
        if (id == Guid.Empty)
        {
            throw new ArgumentException("ID cannot be empty.", parameterName);
        }

        return id;
    }
}
