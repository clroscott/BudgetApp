using BudgetApp.Domain.Dashboards;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class DashboardPanelPreferenceConfiguration
    : IEntityTypeConfiguration<DashboardPanelPreference>
{
    public void Configure(EntityTypeBuilder<DashboardPanelPreference> builder)
    {
        builder.ToTable("DashboardPanelPreferences", table =>
            table.HasCheckConstraint(
                "CK_DashboardPanelPreferences_DisplayOrder",
                "[DisplayOrder] >= 0"));

        builder.HasKey(panel => panel.Id);
        builder.HasIndex(panel => new { panel.DashboardLayoutId, panel.PanelKey })
            .IsUnique();
        builder.Property(panel => panel.PanelKey)
            .HasMaxLength(DashboardPanelPreference.PanelKeyMaxLength)
            .IsUnicode(false)
            .IsRequired();
        builder.Property(panel => panel.DisplayOrder).IsRequired();

        builder.HasOne<DashboardLayout>()
            .WithMany(layout => layout.Panels)
            .HasForeignKey(panel => panel.DashboardLayoutId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
