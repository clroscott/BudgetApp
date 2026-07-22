using BudgetApp.Domain.Transactions;

namespace BudgetApp.Tests.Domain.Transactions;

public sealed class TransactionTests
{
    [Fact]
    public void CreateManual_CreatesReviewedTransactionWithNormalizedValues()
    {
        var householdId = Guid.NewGuid();
        var accountId = Guid.NewGuid();
        var categoryId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var createdAtUtc = DateTimeOffset.UtcNow;

        var transaction = Transaction.CreateManual(
            householdId,
            accountId,
            categoryId,
            new DateOnly(2026, 7, 20),
            new DateOnly(2026, 7, 21),
            -42.35m,
            "  Grocery purchase  ",
            "  Neighbourhood Market  ",
            "  Weekly groceries  ",
            isExcludedFromBudget: false,
            userId,
            createdAtUtc);

        Assert.NotEqual(Guid.Empty, transaction.Id);
        Assert.Equal(householdId, transaction.HouseholdId);
        Assert.Equal(accountId, transaction.AccountId);
        Assert.Equal(categoryId, transaction.CategoryId);
        Assert.Equal(new DateOnly(2026, 7, 20), transaction.TransactionDate);
        Assert.Equal(new DateOnly(2026, 7, 21), transaction.PostedDate);
        Assert.Equal(-42.35m, transaction.Amount);
        Assert.Equal("Grocery purchase", transaction.Description);
        Assert.Equal("Neighbourhood Market", transaction.MerchantName);
        Assert.Equal("Weekly groceries", transaction.Notes);
        Assert.Equal(TransactionSource.Manual, transaction.Source);
        Assert.Equal(TransactionReviewStatus.Reviewed, transaction.ReviewStatus);
        Assert.Null(transaction.ImportFileId);
        Assert.Null(transaction.ImportRowNumber);
        Assert.Null(transaction.OriginalDescription);
        Assert.False(transaction.IsExcludedFromBudget);
        Assert.False(transaction.IsVoided);
        Assert.Equal(userId, transaction.LastModifiedByUserId);
        Assert.Equal(createdAtUtc, transaction.CreatedAtUtc);
        Assert.Equal(createdAtUtc, transaction.UpdatedAtUtc);
    }

    [Fact]
    public void CreateImported_PreservesImportProvenance()
    {
        var importFileId = Guid.NewGuid();

        var transaction = Transaction.CreateImported(
            Guid.NewGuid(),
            Guid.NewGuid(),
            categoryId: null,
            importFileId,
            importRowNumber: 12,
            new DateOnly(2026, 7, 20),
            postedDate: null,
            amount: 1250m,
            description: "Payroll deposit",
            originalDescription: "  DIRECT DEP PAYROLL  ",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);

        Assert.Equal(TransactionSource.Import, transaction.Source);
        Assert.Equal(importFileId, transaction.ImportFileId);
        Assert.Equal(12, transaction.ImportRowNumber);
        Assert.Equal("DIRECT DEP PAYROLL", transaction.OriginalDescription);
        Assert.Equal(TransactionReviewStatus.Reviewed, transaction.ReviewStatus);
    }

    [Fact]
    public void CreateAdjustment_CreatesExplicitAdjustment()
    {
        var transaction = Transaction.CreateAdjustment(
            Guid.NewGuid(),
            Guid.NewGuid(),
            categoryId: null,
            new DateOnly(2026, 7, 20),
            10m,
            "Balance correction",
            "Confirmed against bank balance",
            isExcludedFromBudget: true,
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);

        Assert.Equal(TransactionSource.Adjustment, transaction.Source);
        Assert.True(transaction.IsExcludedFromBudget);
        Assert.Null(transaction.ImportFileId);
        Assert.Null(transaction.ImportRowNumber);
    }

    [Fact]
    public void UpdateDetails_ChangesEditableValuesWithoutChangingProvenance()
    {
        var householdId = Guid.NewGuid();
        var accountId = Guid.NewGuid();
        var importFileId = Guid.NewGuid();
        var transaction = Transaction.CreateImported(
            householdId,
            accountId,
            categoryId: null,
            importFileId,
            importRowNumber: 4,
            new DateOnly(2026, 7, 18),
            new DateOnly(2026, 7, 19),
            -20m,
            "Original display",
            "ORIGINAL BANK TEXT",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);
        var categoryId = Guid.NewGuid();
        var modifiedByUserId = Guid.NewGuid();
        var updatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(5);

        transaction.UpdateDetails(
            categoryId,
            new DateOnly(2026, 7, 20),
            new DateOnly(2026, 7, 21),
            -22.50m,
            "Corrected display",
            "Corrected merchant",
            "Corrected amount from statement",
            isExcludedFromBudget: true,
            modifiedByUserId,
            updatedAtUtc);

        Assert.Equal(categoryId, transaction.CategoryId);
        Assert.Equal(-22.50m, transaction.Amount);
        Assert.Equal("Corrected display", transaction.Description);
        Assert.Equal("Corrected merchant", transaction.MerchantName);
        Assert.True(transaction.IsExcludedFromBudget);
        Assert.Equal(modifiedByUserId, transaction.LastModifiedByUserId);
        Assert.Equal(updatedAtUtc, transaction.UpdatedAtUtc);
        Assert.Equal(householdId, transaction.HouseholdId);
        Assert.Equal(accountId, transaction.AccountId);
        Assert.Equal(TransactionSource.Import, transaction.Source);
        Assert.Equal(importFileId, transaction.ImportFileId);
        Assert.Equal(4, transaction.ImportRowNumber);
        Assert.Equal("ORIGINAL BANK TEXT", transaction.OriginalDescription);
    }

    [Fact]
    public void FailedUpdate_DoesNotPartiallyChangeTransaction()
    {
        var transaction = Transaction.CreateManual(
            Guid.NewGuid(),
            Guid.NewGuid(),
            categoryId: null,
            new DateOnly(2026, 7, 20),
            postedDate: null,
            -10m,
            "Original",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);

        Assert.Throws<ArgumentException>(() => transaction.UpdateDetails(
            Guid.NewGuid(),
            new DateOnly(2026, 7, 21),
            postedDate: null,
            -99m,
            description: "   ",
            merchantName: "Changed",
            notes: null,
            isExcludedFromBudget: true,
            Guid.NewGuid(),
            DateTimeOffset.UtcNow.AddMinutes(1)));

        Assert.Null(transaction.CategoryId);
        Assert.Equal(new DateOnly(2026, 7, 20), transaction.TransactionDate);
        Assert.Equal(-10m, transaction.Amount);
        Assert.Equal("Original", transaction.Description);
        Assert.Null(transaction.MerchantName);
        Assert.False(transaction.IsExcludedFromBudget);
    }

    [Fact]
    public void ReviewAndVoidLifecycle_TracksLatestModification()
    {
        var transaction = CreateManualTransaction();
        var userId = Guid.NewGuid();
        var needsReviewAtUtc = DateTimeOffset.UtcNow.AddMinutes(1);

        transaction.MarkNeedsReview(userId, needsReviewAtUtc);
        Assert.Equal(TransactionReviewStatus.NeedsReview, transaction.ReviewStatus);
        Assert.Equal(userId, transaction.LastModifiedByUserId);
        Assert.Equal(needsReviewAtUtc, transaction.UpdatedAtUtc);

        var voidedAtUtc = needsReviewAtUtc.AddMinutes(1);
        transaction.Void(userId, voidedAtUtc);
        Assert.True(transaction.IsVoided);

        var restoredAtUtc = voidedAtUtc.AddMinutes(1);
        transaction.Restore(userId, restoredAtUtc);
        transaction.MarkReviewed(userId, restoredAtUtc);
        Assert.False(transaction.IsVoided);
        Assert.Equal(TransactionReviewStatus.Reviewed, transaction.ReviewStatus);
        Assert.Equal(restoredAtUtc, transaction.UpdatedAtUtc);
    }

    [Fact]
    public void CreateManual_WithZeroAmount_IsRejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Transaction.CreateManual(
                Guid.NewGuid(),
                Guid.NewGuid(),
                categoryId: null,
                DateOnly.FromDateTime(DateTime.UtcNow),
                postedDate: null,
                amount: 0,
                "Invalid",
                merchantName: null,
                notes: null,
                isExcludedFromBudget: false,
                Guid.NewGuid(),
                DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData("0.00001")]
    [InlineData("1000000000000000")]
    public void CreateManual_WithAmountOutsideStoredPrecision_IsRejected(
        string amountText)
    {
        var amount = decimal.Parse(
            amountText,
            System.Globalization.CultureInfo.InvariantCulture);

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Transaction.CreateManual(
                Guid.NewGuid(),
                Guid.NewGuid(),
                categoryId: null,
                DateOnly.FromDateTime(DateTime.UtcNow),
                postedDate: null,
                amount,
                "Invalid",
                merchantName: null,
                notes: null,
                isExcludedFromBudget: false,
                Guid.NewGuid(),
                DateTimeOffset.UtcNow));
    }

    [Fact]
    public void CreateImported_WithoutValidImportReference_IsRejected()
    {
        Assert.Throws<ArgumentException>(() =>
            Transaction.CreateImported(
                Guid.NewGuid(),
                Guid.NewGuid(),
                categoryId: null,
                Guid.Empty,
                importRowNumber: 1,
                DateOnly.FromDateTime(DateTime.UtcNow),
                postedDate: null,
                -10m,
                "Invalid import",
                "RAW",
                merchantName: null,
                notes: null,
                isExcludedFromBudget: false,
                Guid.NewGuid(),
                DateTimeOffset.UtcNow));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Transaction.CreateImported(
                Guid.NewGuid(),
                Guid.NewGuid(),
                categoryId: null,
                Guid.NewGuid(),
                importRowNumber: 0,
                DateOnly.FromDateTime(DateTime.UtcNow),
                postedDate: null,
                -10m,
                "Invalid import",
                "RAW",
                merchantName: null,
                notes: null,
                isExcludedFromBudget: false,
                Guid.NewGuid(),
                DateTimeOffset.UtcNow));
    }

    private static Transaction CreateManualTransaction() =>
        Transaction.CreateManual(
            Guid.NewGuid(),
            Guid.NewGuid(),
            categoryId: null,
            DateOnly.FromDateTime(DateTime.UtcNow),
            postedDate: null,
            -10m,
            "Test transaction",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);
}
