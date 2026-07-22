using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class ImportTransactionDraftConfiguration
    : IEntityTypeConfiguration<ImportTransactionDraft>
{
    public void Configure(EntityTypeBuilder<ImportTransactionDraft> builder)
    {
        builder.ToTable("ImportTransactionDrafts", table =>
        {
            table.HasCheckConstraint(
                "CK_ImportTransactionDrafts_SourceRowNumber_Positive",
                "[SourceRowNumber] > 0");
            table.HasCheckConstraint(
                "CK_ImportTransactionDrafts_Validation",
                "([ValidationStatus] = 'Valid' AND [TransactionDate] IS NOT NULL " +
                "AND [Amount] IS NOT NULL AND [Amount] <> 0 " +
                "AND [Description] IS NOT NULL AND [ValidationMessage] IS NULL) OR " +
                "([ValidationStatus] = 'Invalid' AND [ValidationMessage] IS NOT NULL)");
            table.HasCheckConstraint(
                "CK_ImportTransactionDrafts_DuplicateMatch",
                "([DuplicateStatus] = 'PossibleDuplicate' AND " +
                "[PossibleMatchingTransactionId] IS NOT NULL) OR " +
                "([DuplicateStatus] <> 'PossibleDuplicate' AND " +
                "[PossibleMatchingTransactionId] IS NULL)");
            table.HasCheckConstraint(
                "CK_ImportTransactionDrafts_ReviewMetadata",
                "([ReviewDecision] = 'Pending' AND [ReviewedByUserId] IS NULL " +
                "AND [ReviewedAtUtc] IS NULL) OR " +
                "([ReviewDecision] <> 'Pending' AND [ReviewedByUserId] IS NOT NULL " +
                "AND [ReviewedAtUtc] IS NOT NULL)");
            table.HasCheckConstraint(
                "CK_ImportTransactionDrafts_Approval",
                "[ReviewDecision] <> 'Approved' OR " +
                "([ValidationStatus] = 'Valid' AND " +
                "([DuplicateStatus] <> 'PossibleDuplicate' OR " +
                "[IsDuplicateAcknowledged] = 1))");
            table.HasCheckConstraint(
                "CK_ImportTransactionDrafts_ApprovedTransaction",
                "[ApprovedTransactionId] IS NULL OR [ReviewDecision] = 'Approved'");
        });

        builder.HasKey(draft => draft.Id);

        builder.HasIndex(draft => new
            {
                draft.ImportFileId,
                draft.SourceRowNumber
            })
            .IsUnique();

        builder.HasIndex(draft => new
        {
            draft.ImportFileId,
            draft.ReviewDecision
        });

        builder.HasIndex(draft => new
        {
            draft.ImportFileId,
            draft.ValidationStatus
        });

        builder.HasIndex(draft => draft.ApprovedTransactionId)
            .IsUnique()
            .HasFilter("[ApprovedTransactionId] IS NOT NULL");

        builder.Property(draft => draft.RawData)
            .HasMaxLength(ImportTransactionDraft.RawDataMaxLength)
            .IsRequired();

        builder.Property(draft => draft.OriginalAmount)
            .HasPrecision(28, 8);

        builder.Property(draft => draft.OriginalDescription)
            .HasMaxLength(ImportTransactionDraft.ParsedDescriptionMaxLength);

        builder.Property(draft => draft.OriginalValidationMessage)
            .HasMaxLength(ImportTransactionDraft.ValidationMessageMaxLength);

        builder.Property(draft => draft.Amount)
            .HasPrecision(28, 8);

        builder.Property(draft => draft.Description)
            .HasMaxLength(ImportTransactionDraft.ParsedDescriptionMaxLength);

        builder.Property(draft => draft.ValidationStatus)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(draft => draft.ValidationMessage)
            .HasMaxLength(ImportTransactionDraft.ValidationMessageMaxLength);

        builder.Property(draft => draft.DuplicateStatus)
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(draft => draft.ReviewDecision)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(draft => draft.IsDuplicateAcknowledged)
            .IsRequired();

        builder.Property(draft => draft.CreatedAtUtc)
            .IsRequired();

        builder.Property(draft => draft.UpdatedAtUtc)
            .IsRequired()
            .IsConcurrencyToken();

        builder.HasOne<ImportFile>()
            .WithMany()
            .HasForeignKey(draft => draft.ImportFileId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(draft => draft.SuggestedCategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(draft => draft.SelectedCategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Transaction>()
            .WithMany()
            .HasForeignKey(draft => draft.PossibleMatchingTransactionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Transaction>()
            .WithMany()
            .HasForeignKey(draft => draft.ApprovedTransactionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(draft => draft.ReviewedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
