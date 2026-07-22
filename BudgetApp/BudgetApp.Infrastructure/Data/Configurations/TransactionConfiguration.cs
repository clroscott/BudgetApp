using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
{
    public void Configure(EntityTypeBuilder<Transaction> builder)
    {
        builder.ToTable("Transactions", table =>
        {
            table.HasCheckConstraint(
                "CK_Transactions_Amount_NonZero",
                "[Amount] <> 0");
            table.HasCheckConstraint(
                "CK_Transactions_Source_ImportReference",
                "([Source] = 'Import' AND [ImportFileId] IS NOT NULL AND " +
                "[ImportRowNumber] IS NOT NULL AND [ImportRowNumber] > 0) OR " +
                "([Source] <> 'Import' AND [ImportFileId] IS NULL AND " +
                "[ImportRowNumber] IS NULL)");
        });

        builder.HasKey(transaction => transaction.Id);

        builder.HasIndex(transaction => new
        {
            transaction.HouseholdId,
            transaction.TransactionDate
        });

        builder.HasIndex(transaction => new
        {
            transaction.AccountId,
            transaction.TransactionDate
        });

        builder.HasIndex(transaction => new
        {
            transaction.CategoryId,
            transaction.TransactionDate
        });

        builder.HasIndex(transaction => new
        {
            transaction.ImportFileId,
            transaction.ImportRowNumber
        })
            .IsUnique()
            .HasFilter("[ImportFileId] IS NOT NULL");

        builder.Property(transaction => transaction.Amount)
            .HasPrecision(19, 4)
            .IsRequired();

        builder.Property(transaction => transaction.Description)
            .HasMaxLength(Transaction.DescriptionMaxLength)
            .IsRequired();

        builder.Property(transaction => transaction.OriginalDescription)
            .HasMaxLength(Transaction.OriginalDescriptionMaxLength);

        builder.Property(transaction => transaction.MerchantName)
            .HasMaxLength(Transaction.MerchantNameMaxLength);

        builder.Property(transaction => transaction.Notes)
            .HasMaxLength(Transaction.NotesMaxLength);

        builder.Property(transaction => transaction.Source)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(transaction => transaction.ReviewStatus)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(transaction => transaction.IsExcludedFromBudget)
            .IsRequired();

        builder.Property(transaction => transaction.IsVoided)
            .IsRequired();

        builder.Property(transaction => transaction.CreatedAtUtc)
            .IsRequired();

        builder.Property(transaction => transaction.UpdatedAtUtc)
            .IsRequired()
            .IsConcurrencyToken();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(transaction => transaction.HouseholdId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(transaction => transaction.AccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(transaction => transaction.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<ImportFile>()
            .WithMany()
            .HasForeignKey(transaction => transaction.ImportFileId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(transaction => transaction.LastModifiedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
