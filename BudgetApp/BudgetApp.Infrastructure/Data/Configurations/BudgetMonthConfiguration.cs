using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class BudgetMonthConfiguration : IEntityTypeConfiguration<BudgetMonth>
{
    public void Configure(EntityTypeBuilder<BudgetMonth> builder)
    {
        builder.ToTable("BudgetMonths", table =>
        {
            table.HasCheckConstraint(
                "CK_BudgetMonths_Year",
                $"[Year] >= {BudgetMonth.MinimumYear} AND [Year] <= {BudgetMonth.MaximumYear}");
            table.HasCheckConstraint(
                "CK_BudgetMonths_Month",
                "[Month] >= 1 AND [Month] <= 12");
            table.HasCheckConstraint(
                "CK_BudgetMonths_Scope_Owner",
                "([Scope] = 'Household' AND [OwnerUserId] IS NULL) OR " +
                "([Scope] = 'Personal' AND [OwnerUserId] IS NOT NULL)");
        });

        builder.HasKey(budgetMonth => budgetMonth.Id);

        builder.HasIndex(budgetMonth => new
            {
                budgetMonth.HouseholdId,
                budgetMonth.Year,
                budgetMonth.Month
            })
            .IsUnique()
            .HasFilter("[Scope] = 'Household'");

        builder.HasIndex(budgetMonth => new
            {
                budgetMonth.HouseholdId,
                budgetMonth.Year,
                budgetMonth.Month,
                budgetMonth.OwnerUserId
            })
            .IsUnique()
            .HasFilter("[Scope] = 'Personal'");

        builder.Property(budgetMonth => budgetMonth.Scope)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(budgetMonth => budgetMonth.Currency)
            .HasMaxLength(BudgetMonth.CurrencyCodeLength)
            .IsFixedLength()
            .IsUnicode(false)
            .IsRequired();

        builder.Property(budgetMonth => budgetMonth.Status)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(budgetMonth => budgetMonth.CreatedAtUtc)
            .IsRequired();

        builder.Property(budgetMonth => budgetMonth.UpdatedAtUtc)
            .IsRequired()
            .IsConcurrencyToken();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(budgetMonth => budgetMonth.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(budgetMonth => budgetMonth.OwnerUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Navigation(budgetMonth => budgetMonth.Lines)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
