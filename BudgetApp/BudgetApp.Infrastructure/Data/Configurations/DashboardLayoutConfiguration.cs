using BudgetApp.Domain.Dashboards;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class DashboardLayoutConfiguration
    : IEntityTypeConfiguration<DashboardLayout>
{
    public void Configure(EntityTypeBuilder<DashboardLayout> builder)
    {
        builder.ToTable("DashboardLayouts", table =>
            table.HasCheckConstraint(
                "CK_DashboardLayouts_PreferredColumnCount",
                "[PreferredColumnCount] > 0"));

        builder.HasKey(layout => layout.Id);
        builder.HasIndex(layout => new { layout.HouseholdId, layout.UserId })
            .IsUnique();

        builder.Property(layout => layout.PreferredColumnCount).IsRequired();
        builder.Property(layout => layout.CreatedAtUtc).IsRequired();
        builder.Property(layout => layout.UpdatedAtUtc)
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(layout => layout.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(layout => layout.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Navigation(layout => layout.Panels)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
