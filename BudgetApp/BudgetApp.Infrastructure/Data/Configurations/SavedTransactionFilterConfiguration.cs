using BudgetApp.Domain.Households;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class SavedTransactionFilterConfiguration : IEntityTypeConfiguration<SavedTransactionFilter>
{
    public void Configure(EntityTypeBuilder<SavedTransactionFilter> builder)
    {
        builder.ToTable("SavedTransactionFilters");
        builder.HasKey(filter => filter.Id);
        builder.Property(filter => filter.Name).HasMaxLength(100).IsRequired();
        builder.Property(filter => filter.NormalizedName).HasMaxLength(100).IsRequired();
        builder.Property(filter => filter.DefinitionJson).HasMaxLength(4000).IsRequired();
        builder.Property(filter => filter.Version).IsConcurrencyToken();
        builder.HasIndex(filter => new { filter.HouseholdId, filter.UserId, filter.NormalizedName }).IsUnique();
        builder.HasOne<Household>().WithMany().HasForeignKey(filter => filter.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<ApplicationUser>().WithMany().HasForeignKey(filter => filter.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
