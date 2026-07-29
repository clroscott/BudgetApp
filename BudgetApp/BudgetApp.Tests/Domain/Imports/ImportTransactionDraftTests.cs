using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;

namespace BudgetApp.Tests.Domain.Imports;

public sealed class ImportTransactionDraftTests
{
    [Fact]
    public void Create_WithParsedValues_CreatesValidPendingDraft()
    {
        var importFileId = Guid.NewGuid();
        var createdAtUtc = DateTimeOffset.UtcNow;

        var draft = ImportTransactionDraft.Create(
            importFileId,
            sourceRowNumber: 2,
            rawData: "{\"date\":\"2026-07-20\",\"amount\":\"-25.50\"}",
            new DateOnly(2026, 7, 20),
            -25.50m,
            "  Example Market  ",
            validationMessage: null,
            createdAtUtc);

        Assert.Equal(importFileId, draft.ImportFileId);
        Assert.Equal(2, draft.SourceRowNumber);
        Assert.Equal(new DateOnly(2026, 7, 20), draft.OriginalTransactionDate);
        Assert.Equal(-25.50m, draft.OriginalAmount);
        Assert.Equal("Example Market", draft.OriginalDescription);
        Assert.Equal(draft.OriginalTransactionDate, draft.TransactionDate);
        Assert.Equal(draft.OriginalAmount, draft.Amount);
        Assert.Equal(draft.OriginalDescription, draft.Description);
        Assert.Equal(ImportDraftValidationStatus.Valid, draft.ValidationStatus);
        Assert.Null(draft.ValidationMessage);
        Assert.Equal(ImportDraftDuplicateStatus.NotChecked, draft.DuplicateStatus);
        Assert.Equal(ImportDraftReviewDecision.Pending, draft.ReviewDecision);
    }

    [Fact]
    public void Correction_MakesInvalidDraftValidWithoutChangingOriginalValues()
    {
        var draft = ImportTransactionDraft.Create(
            Guid.NewGuid(),
            3,
            "{\"date\":\"unknown\",\"amount\":\"12.34567\"}",
            parsedTransactionDate: null,
            parsedAmount: 12.34567m,
            parsedDescription: null,
            "Date could not be parsed.",
            DateTimeOffset.UtcNow);

        Assert.Equal(ImportDraftValidationStatus.Invalid, draft.ValidationStatus);
        Assert.Throws<InvalidOperationException>(() =>
            draft.Approve(Guid.NewGuid(), false, DateTimeOffset.UtcNow));

        var categoryId = Guid.NewGuid();
        draft.CorrectParsedValues(
            new DateOnly(2026, 7, 20),
            12.35m,
            "Corrected transaction",
            categoryId,
            DateTimeOffset.UtcNow.AddMinutes(1));

        Assert.Equal(ImportDraftValidationStatus.Valid, draft.ValidationStatus);
        Assert.Null(draft.ValidationMessage);
        Assert.Equal(new DateOnly(2026, 7, 20), draft.TransactionDate);
        Assert.Equal(12.35m, draft.Amount);
        Assert.Equal(categoryId, draft.SelectedCategoryId);
        Assert.Null(draft.OriginalTransactionDate);
        Assert.Equal(12.34567m, draft.OriginalAmount);
        Assert.Null(draft.OriginalDescription);
        Assert.Equal("Date could not be parsed.", draft.OriginalValidationMessage);
    }

    [Fact]
    public void Approve_PossibleDuplicateRequiresExplicitAcknowledgement()
    {
        var draft = CreateValidDraft();
        var possibleMatchId = Guid.NewGuid();
        draft.SetDuplicateResult(
            ImportDraftDuplicateStatus.PossibleDuplicate,
            possibleMatchId,
            DateTimeOffset.UtcNow);

        Assert.Throws<InvalidOperationException>(() =>
            draft.Approve(Guid.NewGuid(), false, DateTimeOffset.UtcNow));

        var reviewerId = Guid.NewGuid();
        draft.Approve(reviewerId, true, DateTimeOffset.UtcNow.AddMinutes(1));

        Assert.Equal(ImportDraftReviewDecision.Approved, draft.ReviewDecision);
        Assert.True(draft.IsDuplicateAcknowledged);
        Assert.Equal(reviewerId, draft.ReviewedByUserId);
    }

    [Fact]
    public void ChangingCorrectedValues_ResetsPreviousReviewDecision()
    {
        var draft = CreateValidDraft();
        draft.SetDuplicateResult(
            ImportDraftDuplicateStatus.NoMatch,
            possibleMatchingTransactionId: null,
            DateTimeOffset.UtcNow);
        draft.Approve(Guid.NewGuid(), false, DateTimeOffset.UtcNow);

        draft.CorrectParsedValues(
            draft.TransactionDate,
            -30m,
            "Corrected",
            selectedCategoryId: null,
            DateTimeOffset.UtcNow.AddMinutes(1));

        Assert.Equal(ImportDraftReviewDecision.Pending, draft.ReviewDecision);
        Assert.Null(draft.ReviewedByUserId);
        Assert.Null(draft.ReviewedAtUtc);
        Assert.Equal(ImportDraftDuplicateStatus.NotChecked, draft.DuplicateStatus);
        Assert.Null(draft.PossibleMatchingTransactionId);
    }

    [Fact]
    public void MarkPending_PreservesCorrectedValuesAndClearsReviewMetadata()
    {
        var draft = CreateValidDraft();
        var categoryId = Guid.NewGuid();
        draft.CorrectParsedValues(
            draft.TransactionDate,
            -30m,
            "Corrected",
            categoryId,
            DateTimeOffset.UtcNow);
        draft.SetDuplicateResult(
            ImportDraftDuplicateStatus.PossibleDuplicate,
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);
        draft.Approve(Guid.NewGuid(), true, DateTimeOffset.UtcNow);

        draft.MarkPending(DateTimeOffset.UtcNow.AddMinutes(1));

        Assert.Equal(ImportDraftReviewDecision.Pending, draft.ReviewDecision);
        Assert.False(draft.IsDuplicateAcknowledged);
        Assert.Null(draft.ReviewedByUserId);
        Assert.Null(draft.ReviewedAtUtc);
        Assert.Equal(-30m, draft.Amount);
        Assert.Equal("Corrected", draft.Description);
        Assert.Equal(categoryId, draft.SelectedCategoryId);
        Assert.Equal(
            ImportDraftDuplicateStatus.PossibleDuplicate,
            draft.DuplicateStatus);
    }

    [Fact]
    public void Exclude_SetsOneClearNonImportDecision()
    {
        var draft = CreateValidDraft();
        var reviewerId = Guid.NewGuid();

        draft.Exclude(reviewerId, DateTimeOffset.UtcNow);

        Assert.Equal(ImportDraftReviewDecision.Excluded, draft.ReviewDecision);
        Assert.Equal(reviewerId, draft.ReviewedByUserId);
        Assert.NotNull(draft.ReviewedAtUtc);
        Assert.False(draft.IsDuplicateAcknowledged);
    }

    [Fact]
    public void LinkApprovedTransaction_IsIdempotentAndLocksDraft()
    {
        var importFileId = Guid.NewGuid();
        var draft = CreateValidDraft(importFileId, sourceRowNumber: 8);
        draft.SetDuplicateResult(
            ImportDraftDuplicateStatus.NoMatch,
            possibleMatchingTransactionId: null,
            DateTimeOffset.UtcNow);
        var userId = Guid.NewGuid();
        draft.Approve(userId, false, DateTimeOffset.UtcNow);
        var transaction = Transaction.CreateImported(
            Guid.NewGuid(),
            Guid.NewGuid(),
            categoryId: null,
            importFileId,
            importRowNumber: 8,
            draft.TransactionDate!.Value,
            postedDate: null,
            draft.Amount!.Value,
            draft.Description!,
            draft.OriginalDescription,
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            userId,
            DateTimeOffset.UtcNow);

        draft.LinkApprovedTransaction(transaction, DateTimeOffset.UtcNow);
        draft.LinkApprovedTransaction(transaction, DateTimeOffset.UtcNow.AddMinutes(1));

        Assert.Equal(transaction.Id, draft.ApprovedTransactionId);
        Assert.Throws<InvalidOperationException>(() =>
            draft.CorrectParsedValues(
                draft.TransactionDate,
                draft.Amount,
                "Changed",
                selectedCategoryId: null,
                DateTimeOffset.UtcNow));
    }

    [Fact]
    public void LinkApprovedTransaction_WithDifferentProvenance_IsRejected()
    {
        var draft = CreateValidDraft();
        draft.SetDuplicateResult(
            ImportDraftDuplicateStatus.NoMatch,
            possibleMatchingTransactionId: null,
            DateTimeOffset.UtcNow);
        var userId = Guid.NewGuid();
        draft.Approve(userId, false, DateTimeOffset.UtcNow);
        var transaction = Transaction.CreateImported(
            Guid.NewGuid(),
            Guid.NewGuid(),
            categoryId: null,
            Guid.NewGuid(),
            importRowNumber: draft.SourceRowNumber,
            draft.TransactionDate!.Value,
            postedDate: null,
            draft.Amount!.Value,
            draft.Description!,
            draft.OriginalDescription,
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            userId,
            DateTimeOffset.UtcNow);

        Assert.Throws<ArgumentException>(() =>
            draft.LinkApprovedTransaction(transaction, DateTimeOffset.UtcNow));
    }

    private static ImportTransactionDraft CreateValidDraft(
        Guid? importFileId = null,
        int sourceRowNumber = 2) =>
        ImportTransactionDraft.Create(
            importFileId ?? Guid.NewGuid(),
            sourceRowNumber,
            "{\"date\":\"2026-07-20\",\"amount\":\"-25.50\"}",
            new DateOnly(2026, 7, 20),
            -25.50m,
            "Example Market",
            validationMessage: null,
            DateTimeOffset.UtcNow);
}
