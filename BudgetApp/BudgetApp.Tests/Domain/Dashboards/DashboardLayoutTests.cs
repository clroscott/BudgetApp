using BudgetApp.Domain.Dashboards;

namespace BudgetApp.Tests.Domain.Dashboards;

public sealed class DashboardLayoutTests
{
    [Fact]
    public void Create_StoresOrderedVisiblePanels()
    {
        var layout = DashboardLayout.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            3,
            ["transactions", "monthly-budget"],
            DateTimeOffset.UtcNow);

        Assert.Equal(3, layout.PreferredColumnCount);
        Assert.Equal(
            ["transactions", "monthly-budget"],
            layout.Panels
                .OrderBy(panel => panel.DisplayOrder)
                .Select(panel => panel.PanelKey));
    }

    [Fact]
    public void Update_CanStoreAnEmptyDashboard()
    {
        var layout = DashboardLayout.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            3,
            ["transactions"],
            DateTimeOffset.UtcNow);

        layout.Update(4, [], DateTimeOffset.UtcNow);

        Assert.Equal(4, layout.PreferredColumnCount);
        Assert.Empty(layout.Panels);
    }

    [Fact]
    public void DuplicatePanel_IsRejected()
    {
        Assert.Throws<ArgumentException>(() => DashboardLayout.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            3,
            ["transactions", "TRANSACTIONS"],
            DateTimeOffset.UtcNow));
    }
}
