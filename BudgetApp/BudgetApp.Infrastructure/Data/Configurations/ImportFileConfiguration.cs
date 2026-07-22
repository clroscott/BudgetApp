using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class ImportFileConfiguration : IEntityTypeConfiguration<ImportFile>
{
    public void Configure(EntityTypeBuilder<ImportFile> builder)
    {
        builder.ToTable("ImportFiles", table =>
        {
            table.HasCheckConstraint(
                "CK_ImportFiles_FileSize_Positive",
                "[FileSizeBytes] > 0");
            table.HasCheckConstraint(
                "CK_ImportFiles_RowCounts",
                "[TotalRowCount] >= 0 AND [ValidRowCount] >= 0 AND " +
                "[InvalidRowCount] >= 0 AND [ApprovedRowCount] >= 0 AND " +
                "[RejectedRowCount] >= 0 AND [SkippedRowCount] >= 0 AND " +
                "[DuplicateRowCount] >= 0 AND " +
                "[ValidRowCount] + [InvalidRowCount] = [TotalRowCount] AND " +
                "[ApprovedRowCount] <= [ValidRowCount] AND " +
                "[ApprovedRowCount] + [RejectedRowCount] + [SkippedRowCount] " +
                "<= [TotalRowCount] AND [DuplicateRowCount] <= [TotalRowCount]");
            table.HasCheckConstraint(
                "CK_ImportFiles_Status_FailureSummary",
                "([Status] = 'Failed' AND [FailureSummary] IS NOT NULL) OR " +
                "([Status] <> 'Failed' AND [FailureSummary] IS NULL)");
        });

        builder.HasKey(importFile => importFile.Id);

        builder.HasIndex(importFile => new
        {
            importFile.HouseholdId,
            importFile.UploadedAtUtc
        });

        builder.HasIndex(importFile => new
        {
            importFile.AccountId,
            importFile.UploadedAtUtc
        });

        builder.HasIndex(importFile => new
        {
            importFile.AccountId,
            importFile.Sha256Hash
        });

        builder.Property(importFile => importFile.OriginalFileName)
            .HasMaxLength(ImportFile.OriginalFileNameMaxLength)
            .IsRequired();

        builder.Property(importFile => importFile.FileSizeBytes)
            .IsRequired();

        builder.Property(importFile => importFile.Sha256Hash)
            .HasMaxLength(ImportFile.Sha256HashLength)
            .IsFixedLength()
            .IsUnicode(false)
            .IsRequired();

        builder.Property(importFile => importFile.Status)
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(importFile => importFile.FailureSummary)
            .HasMaxLength(ImportFile.FailureSummaryMaxLength);

        builder.Property(importFile => importFile.UploadedAtUtc)
            .IsRequired();

        builder.Property(importFile => importFile.UpdatedAtUtc)
            .IsRequired()
            .IsConcurrencyToken();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(importFile => importFile.HouseholdId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(importFile => importFile.AccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(importFile => importFile.UploadedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
