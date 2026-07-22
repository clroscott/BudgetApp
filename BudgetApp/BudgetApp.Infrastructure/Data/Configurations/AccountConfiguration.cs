using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("Accounts", table =>
            table.HasCheckConstraint(
                "CK_Accounts_Scope_Owner",
                "([Scope] = 'Household' AND [OwnerUserId] IS NULL) OR " +
                "([Scope] = 'Personal' AND [OwnerUserId] IS NOT NULL)"));

        builder.HasKey(account => account.Id);

        builder.HasIndex(account => account.HouseholdId);

        builder.HasIndex(account => new
        {
            account.HouseholdId,
            account.Scope,
            account.OwnerUserId
        });

        builder.Property(account => account.Name)
            .HasMaxLength(Account.NameMaxLength)
            .IsRequired();

        builder.Property(account => account.Type)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(account => account.Scope)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(account => account.Currency)
            .HasMaxLength(Account.CurrencyCodeLength)
            .IsFixedLength()
            .IsUnicode(false)
            .IsRequired();

        builder.Property(account => account.InstitutionName)
            .HasMaxLength(Account.InstitutionNameMaxLength);

        builder.Property(account => account.LastFourDigits)
            .HasMaxLength(Account.LastFourDigitsLength)
            .IsFixedLength()
            .IsUnicode(false);

        builder.Property(account => account.IsActive)
            .IsRequired();

        builder.Property(account => account.CreatedAtUtc)
            .IsRequired();

        builder.Property(account => account.UpdatedAtUtc)
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(account => account.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(account => account.OwnerUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
