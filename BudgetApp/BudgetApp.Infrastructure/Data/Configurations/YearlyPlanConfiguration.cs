using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class YearlyPlanConfiguration : IEntityTypeConfiguration<YearlyPlan>
{
    public void Configure(EntityTypeBuilder<YearlyPlan> builder)
    {
        builder.ToTable("YearlyPlans", table =>
        {
            table.HasCheckConstraint(
                "CK_YearlyPlans_StartMonth",
                "[FiscalYearStartMonth] >= 1 AND [FiscalYearStartMonth] <= 12");
            table.HasCheckConstraint(
                "CK_YearlyPlans_Scope_Owner",
                "([Scope] = 'Household' AND [OwnerUserId] IS NULL) OR " +
                "([Scope] = 'Personal' AND [OwnerUserId] IS NOT NULL)");
        });
        builder.HasKey(plan => plan.Id);
        builder.HasIndex(plan => new
            {
                plan.HouseholdId,
                plan.FiscalYearStartYear
            })
            .IsUnique()
            .HasFilter("[Scope] = 'Household'");
        builder.HasIndex(plan => new
            {
                plan.HouseholdId,
                plan.FiscalYearStartYear,
                plan.OwnerUserId
            })
            .IsUnique()
            .HasFilter("[Scope] = 'Personal'");
        builder.Property(plan => plan.Scope)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();
        builder.Property(plan => plan.Currency)
            .HasMaxLength(BudgetMonth.CurrencyCodeLength)
            .IsFixedLength()
            .IsUnicode(false)
            .IsRequired();
        builder.Property(plan => plan.CreatedAtUtc).IsRequired();
        builder.Property(plan => plan.UpdatedAtUtc).IsRequired().IsConcurrencyToken();
        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(plan => plan.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(plan => plan.OwnerUserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.Navigation(plan => plan.Lines)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
