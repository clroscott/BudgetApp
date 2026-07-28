using BudgetApp.Domain.Imports;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class ImportProfileConfiguration
    : IEntityTypeConfiguration<ImportProfile>
{
    public void Configure(EntityTypeBuilder<ImportProfile> builder)
    {
        builder.ToTable("ImportProfiles");
        builder.HasKey(profile => profile.Id);
        builder.Property(profile => profile.Name)
            .HasMaxLength(ImportProfile.NameMaxLength).IsRequired();
        builder.Property(profile => profile.Headers)
            .HasMaxLength(ImportProfile.HeadersMaxLength).IsRequired();
        builder.Property(profile => profile.HeaderSignature)
            .HasMaxLength(64).IsRequired();
        foreach (var property in new[]
        {
            nameof(ImportProfile.DateColumn),
            nameof(ImportProfile.DescriptionColumn),
            nameof(ImportProfile.AmountColumn),
            nameof(ImportProfile.DebitColumn),
            nameof(ImportProfile.CreditColumn),
            nameof(ImportProfile.CategoryColumn),
            nameof(ImportProfile.SubcategoryColumn)
        })
            builder.Property(property).HasMaxLength(ImportProfile.HeaderNameMaxLength);
        builder.Property(profile => profile.AmountConvention)
            .HasConversion<string>().HasMaxLength(30).IsRequired();
        builder.HasIndex(profile => new { profile.HouseholdId, profile.HeaderSignature });
        builder.HasIndex(profile => profile.DefaultAccountId);
        builder.HasOne<BudgetApp.Domain.Households.Household>()
            .WithMany().HasForeignKey(profile => profile.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<BudgetApp.Domain.Accounts.Account>()
            .WithMany().HasForeignKey(profile => profile.DefaultAccountId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
