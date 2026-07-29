using BudgetApp.Domain.Imports;

namespace BudgetApp.Tests.Domain.Imports;

public sealed class ImportFileTests
{
    private const string ValidHash =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public void Create_CreatesUploadedImportWithNormalizedMetadata()
    {
        var householdId = Guid.NewGuid();
        var accountId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var uploadedAtUtc = DateTimeOffset.UtcNow;

        var importFile = ImportFile.Create(
            householdId,
            accountId,
            userId,
            "  july-transactions.csv  ",
            2048,
            ValidHash,
            uploadedAtUtc);

        Assert.NotEqual(Guid.Empty, importFile.Id);
        Assert.Equal(householdId, importFile.HouseholdId);
        Assert.Equal(accountId, importFile.AccountId);
        Assert.Equal(userId, importFile.UploadedByUserId);
        Assert.Equal("july-transactions.csv", importFile.OriginalFileName);
        Assert.Equal(2048, importFile.FileSizeBytes);
        Assert.Equal(ValidHash.ToUpperInvariant(), importFile.Sha256Hash);
        Assert.Equal(ImportFileStatus.Uploaded, importFile.Status);
        Assert.Equal(0, importFile.TotalRowCount);
        Assert.Null(importFile.FailureSummary);
        Assert.Equal(uploadedAtUtc, importFile.UploadedAtUtc);
        Assert.Equal(uploadedAtUtc, importFile.UpdatedAtUtc);
    }

    [Fact]
    public void ProcessingReviewAndCompletion_FollowValidLifecycle()
    {
        var importFile = CreateImportFile();
        var processingAtUtc = DateTimeOffset.UtcNow.AddMinutes(1);
        importFile.StartProcessing(processingAtUtc);

        var parsedStatistics = new ImportStatistics(
            totalRows: 3,
            validRows: 2,
            invalidRows: 1,
            approvedRows: 0,
            excludedRows: 0,
            duplicateRows: 1);
        importFile.MarkReadyForReview(
            parsedStatistics,
            processingAtUtc.AddMinutes(1));

        Assert.Equal(ImportFileStatus.ReadyForReview, importFile.Status);
        Assert.Equal(3, importFile.TotalRowCount);
        Assert.Equal(2, importFile.ValidRowCount);
        Assert.Equal(1, importFile.InvalidRowCount);

        var completedStatistics = new ImportStatistics(
            totalRows: 3,
            validRows: 2,
            invalidRows: 1,
            approvedRows: 2,
            excludedRows: 1,
            duplicateRows: 1);
        importFile.Complete(
            completedStatistics,
            processingAtUtc.AddMinutes(2));

        Assert.Equal(ImportFileStatus.Completed, importFile.Status);
        Assert.Equal(2, importFile.ApprovedRowCount);
        Assert.Equal(1, importFile.ExcludedRowCount);
    }

    [Fact]
    public void Complete_WithPendingRows_IsRejected()
    {
        var importFile = CreateImportFile();
        importFile.StartProcessing(DateTimeOffset.UtcNow);
        var statistics = new ImportStatistics(2, 2, 0, 0, 0, 0);
        importFile.MarkReadyForReview(statistics, DateTimeOffset.UtcNow);

        Assert.Throws<InvalidOperationException>(() =>
            importFile.Complete(
                new ImportStatistics(2, 2, 0, 1, 0, 0),
                DateTimeOffset.UtcNow));

        Assert.Equal(ImportFileStatus.ReadyForReview, importFile.Status);
    }

    [Fact]
    public void MarkFailed_PreservesFailureAndCanRestartProcessing()
    {
        var importFile = CreateImportFile();

        importFile.MarkFailed("  CSV headers were not recognized.  ", DateTimeOffset.UtcNow);

        Assert.Equal(ImportFileStatus.Failed, importFile.Status);
        Assert.Equal("CSV headers were not recognized.", importFile.FailureSummary);

        importFile.StartProcessing(DateTimeOffset.UtcNow.AddMinutes(1));

        Assert.Equal(ImportFileStatus.Processing, importFile.Status);
        Assert.Null(importFile.FailureSummary);
    }

    [Theory]
    [InlineData("folder/file.csv")]
    [InlineData("folder\\file.csv")]
    public void Create_WithPathInsteadOfFileName_IsRejected(string fileName)
    {
        Assert.Throws<ArgumentException>(() => ImportFile.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            fileName,
            100,
            ValidHash,
            DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData(1, 1, 1, 0, 0, 0)]
    [InlineData(2, 1, 1, 2, 0, 0)]
    [InlineData(1, 1, 0, 0, 0, 2)]
    public void Statistics_WithInconsistentCounts_AreRejected(
        int total,
        int valid,
        int invalid,
        int approved,
        int excluded,
        int duplicate)
    {
        Assert.Throws<ArgumentException>(() => new ImportStatistics(
            total,
            valid,
            invalid,
            approved,
            excluded,
            duplicate));
    }

    private static ImportFile CreateImportFile() =>
        ImportFile.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            "transactions.csv",
            1024,
            ValidHash,
            DateTimeOffset.UtcNow);
}
