using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.CategorizationRules;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class CategorizationRuleConfiguration
    : IEntityTypeConfiguration<CategorizationRule>
{
    public void Configure(EntityTypeBuilder<CategorizationRule> builder)
    {
        builder.ToTable("CategorizationRules", table =>
            table.HasCheckConstraint(
                "CK_CategorizationRules_Priority_NonNegative",
                "[Priority] >= 0"));

        builder.HasKey(rule => rule.Id);

        builder.HasIndex(rule => new
            {
                rule.HouseholdId,
                rule.NormalizedName
            })
            .IsUnique();

        builder.HasIndex(rule => new
            {
                rule.HouseholdId,
                rule.Priority
            });

        builder.Property(rule => rule.Name)
            .HasMaxLength(CategorizationRule.NameMaxLength)
            .IsRequired();

        builder.Property(rule => rule.NormalizedName)
            .HasMaxLength(CategorizationRule.NameMaxLength)
            .IsRequired();

        builder.Property(rule => rule.MatchField)
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(rule => rule.MatchOperator)
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(rule => rule.MatchValue)
            .HasMaxLength(CategorizationRule.MatchValueMaxLength)
            .IsRequired();

        builder.Property(rule => rule.NormalizedMatchValue)
            .HasMaxLength(CategorizationRule.MatchValueMaxLength)
            .IsRequired();

        builder.Property(rule => rule.Priority)
            .IsRequired();

        builder.Property(rule => rule.IsActive)
            .IsRequired();

        builder.Property(rule => rule.CreatedAtUtc)
            .IsRequired();

        builder.Property(rule => rule.UpdatedAtUtc)
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(rule => rule.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(rule => rule.AccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(rule => rule.TargetCategoryId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
