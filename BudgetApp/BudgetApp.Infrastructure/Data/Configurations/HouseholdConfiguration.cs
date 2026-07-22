using BudgetApp.Domain.Households;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class HouseholdConfiguration : IEntityTypeConfiguration<Household>
{
    public void Configure(EntityTypeBuilder<Household> builder)
    {
        builder.ToTable("Households");

        builder.HasKey(household => household.Id);

        builder.Property(household => household.Name)
            .HasMaxLength(Household.NameMaxLength)
            .IsRequired();

        builder.Property(household => household.DefaultCurrency)
            .HasMaxLength(Household.CurrencyCodeLength)
            .IsFixedLength()
            .IsUnicode(false)
            .IsRequired();

        builder.Property(household => household.TimeZoneId)
            .HasMaxLength(Household.TimeZoneIdMaxLength)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(household => household.IsActive)
            .IsRequired();

        builder.Property(household => household.CreatedAtUtc)
            .IsRequired();

        builder.Property(household => household.UpdatedAtUtc)
            .IsRequired();

        builder.HasMany(household => household.Members)
            .WithOne(member => member.Household)
            .HasForeignKey(member => member.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(household => household.Members)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
