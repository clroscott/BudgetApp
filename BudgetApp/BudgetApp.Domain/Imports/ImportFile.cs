namespace BudgetApp.Domain.Imports;

public sealed class ImportFile
{
    public const int OriginalFileNameMaxLength = 255;
    public const int Sha256HashLength = 64;
    public const int FailureSummaryMaxLength = 2000;

    private ImportFile()
    {
    }

    private ImportFile(
        Guid id,
        Guid householdId,
        Guid accountId,
        Guid uploadedByUserId,
        string originalFileName,
        long fileSizeBytes,
        string sha256Hash,
        DateTimeOffset uploadedAtUtc)
    {
        Id = id;
        HouseholdId = ValidateRequiredId(
            householdId,
            nameof(householdId),
            "Household ID");
        AccountId = ValidateRequiredId(accountId, nameof(accountId), "Account ID");
        UploadedByUserId = ValidateRequiredId(
            uploadedByUserId,
            nameof(uploadedByUserId),
            "Uploaded-by user ID");
        OriginalFileName = ValidateFileName(originalFileName);
        FileSizeBytes = ValidateFileSize(fileSizeBytes);
        Sha256Hash = ValidateSha256Hash(sha256Hash);
        Status = ImportFileStatus.Uploaded;
        SetStatistics(default);
        FailureSummary = null;
        UploadedAtUtc = uploadedAtUtc;
        UpdatedAtUtc = uploadedAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public Guid AccountId { get; private set; }

    public Guid UploadedByUserId { get; private set; }

    public string OriginalFileName { get; private set; } = string.Empty;

    public long FileSizeBytes { get; private set; }

    public string Sha256Hash { get; private set; } = string.Empty;

    public ImportFileStatus Status { get; private set; }

    public int TotalRowCount { get; private set; }

    public int ValidRowCount { get; private set; }

    public int InvalidRowCount { get; private set; }

    public int ApprovedRowCount { get; private set; }

    public int RejectedRowCount { get; private set; }

    public int SkippedRowCount { get; private set; }

    public int DuplicateRowCount { get; private set; }

    public string? FailureSummary { get; private set; }

    public DateTimeOffset UploadedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static ImportFile Create(
        Guid householdId,
        Guid accountId,
        Guid uploadedByUserId,
        string originalFileName,
        long fileSizeBytes,
        string sha256Hash,
        DateTimeOffset uploadedAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            accountId,
            uploadedByUserId,
            originalFileName,
            fileSizeBytes,
            sha256Hash,
            uploadedAtUtc);

    public void StartProcessing(DateTimeOffset updatedAtUtc)
    {
        if (Status is not ImportFileStatus.Uploaded and not ImportFileStatus.Failed)
        {
            throw new InvalidOperationException(
                "Only an uploaded or failed import can start processing.");
        }

        Status = ImportFileStatus.Processing;
        SetStatistics(default);
        FailureSummary = null;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void MarkReadyForReview(
        ImportStatistics statistics,
        DateTimeOffset updatedAtUtc)
    {
        if (Status != ImportFileStatus.Processing)
        {
            throw new InvalidOperationException(
                "Only a processing import can become ready for review.");
        }

        if (statistics.TotalRows == 0)
        {
            throw new ArgumentException(
                "An import must contain at least one data row before review.",
                nameof(statistics));
        }

        SetStatistics(statistics);
        Status = ImportFileStatus.ReadyForReview;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void RefreshStatistics(
        ImportStatistics statistics,
        DateTimeOffset updatedAtUtc)
    {
        if (Status != ImportFileStatus.ReadyForReview)
        {
            throw new InvalidOperationException(
                "Statistics can only be refreshed while an import is under review.");
        }

        if (statistics.TotalRows != TotalRowCount)
        {
            throw new ArgumentException(
                "Reviewing an import cannot change its total row count.",
                nameof(statistics));
        }

        SetStatistics(statistics);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void RefreshStatisticsAfterRowRemoval(
        ImportStatistics statistics,
        DateTimeOffset updatedAtUtc)
    {
        if (Status != ImportFileStatus.ReadyForReview)
        {
            throw new InvalidOperationException(
                "Rows can only be removed while an import is under review.");
        }

        if (statistics.TotalRows <= 0 || statistics.TotalRows >= TotalRowCount)
        {
            throw new ArgumentException(
                "Removing a row must reduce the import while leaving at least one row.",
                nameof(statistics));
        }

        SetStatistics(statistics);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Complete(
        ImportStatistics statistics,
        DateTimeOffset updatedAtUtc)
    {
        if (Status != ImportFileStatus.ReadyForReview)
        {
            throw new InvalidOperationException(
                "Only an import ready for review can be completed.");
        }

        if (statistics.TotalRows != TotalRowCount)
        {
            throw new ArgumentException(
                "Completing an import cannot change its total row count.",
                nameof(statistics));
        }

        if (statistics.PendingRows != 0)
        {
            throw new InvalidOperationException(
                "Every import row must be approved, rejected, or skipped before completion.");
        }

        SetStatistics(statistics);
        Status = ImportFileStatus.Completed;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void MarkFailed(string failureSummary, DateTimeOffset updatedAtUtc)
    {
        if (Status == ImportFileStatus.Completed)
        {
            throw new InvalidOperationException(
                "A completed import cannot be marked as failed.");
        }

        var validatedFailureSummary = ValidateRequiredText(
            failureSummary,
            FailureSummaryMaxLength,
            nameof(failureSummary),
            "Failure summary");

        FailureSummary = validatedFailureSummary;
        Status = ImportFileStatus.Failed;
        UpdatedAtUtc = updatedAtUtc;
    }

    private void SetStatistics(ImportStatistics statistics)
    {
        TotalRowCount = statistics.TotalRows;
        ValidRowCount = statistics.ValidRows;
        InvalidRowCount = statistics.InvalidRows;
        ApprovedRowCount = statistics.ApprovedRows;
        RejectedRowCount = statistics.RejectedRows;
        SkippedRowCount = statistics.SkippedRows;
        DuplicateRowCount = statistics.DuplicateRows;
    }

    private static long ValidateFileSize(long fileSizeBytes)
    {
        if (fileSizeBytes <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(fileSizeBytes),
                "Import file size must be positive.");
        }

        return fileSizeBytes;
    }

    private static string ValidateFileName(string originalFileName)
    {
        var validatedFileName = ValidateRequiredText(
            originalFileName,
            OriginalFileNameMaxLength,
            nameof(originalFileName),
            "Original file name");

        if (validatedFileName.IndexOfAny(['/', '\\']) >= 0 ||
            validatedFileName.Any(char.IsControl))
        {
            throw new ArgumentException(
                "Original file name cannot contain a path or control characters.",
                nameof(originalFileName));
        }

        return validatedFileName;
    }

    private static string ValidateSha256Hash(string sha256Hash)
    {
        var normalizedHash = ValidateRequiredText(
            sha256Hash,
            Sha256HashLength,
            nameof(sha256Hash),
            "SHA-256 hash").ToUpperInvariant();

        if (normalizedHash.Length != Sha256HashLength ||
            normalizedHash.Any(character =>
                !char.IsAsciiHexDigit(character)))
        {
            throw new ArgumentException(
                "SHA-256 hash must contain exactly 64 hexadecimal characters.",
                nameof(sha256Hash));
        }

        return normalizedHash;
    }

    private static Guid ValidateRequiredId(
        Guid value,
        string parameterName,
        string displayName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException($"{displayName} is required.", parameterName);
        }

        return value;
    }

    private static string ValidateRequiredText(
        string value,
        int maxLength,
        string parameterName,
        string displayName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{displayName} is required.", parameterName);
        }

        var trimmedValue = value.Trim();
        if (trimmedValue.Length > maxLength)
        {
            throw new ArgumentException(
                $"{displayName} cannot exceed {maxLength} characters.",
                parameterName);
        }

        return trimmedValue;
    }
}
