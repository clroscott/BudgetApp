namespace BudgetApp.Domain.Transactions;

public sealed class Transaction
{
    public const decimal MaxAbsoluteAmount = 999_999_999_999_999.9999m;
    public const int DescriptionMaxLength = 250;
    public const int OriginalDescriptionMaxLength = 500;
    public const int MerchantNameMaxLength = 200;
    public const int NotesMaxLength = 1000;

    private Transaction()
    {
    }

    private Transaction(
        Guid id,
        Guid householdId,
        Guid accountId,
        Guid? categoryId,
        Guid? importFileId,
        int? importRowNumber,
        DateOnly transactionDate,
        DateOnly? postedDate,
        decimal amount,
        string description,
        string? originalDescription,
        string? merchantName,
        string? notes,
        TransactionSource source,
        TransactionReviewStatus reviewStatus,
        bool isExcludedFromBudget,
        Guid modifiedByUserId,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = ValidateRequiredId(
            householdId,
            nameof(householdId),
            "Household ID");
        AccountId = ValidateRequiredId(
            accountId,
            nameof(accountId),
            "Account ID");
        Source = ValidateSource(source);
        SetImportReference(importFileId, importRowNumber);
        ReviewStatus = ValidateReviewStatus(reviewStatus);
        SetEditableDetails(
            categoryId,
            transactionDate,
            postedDate,
            amount,
            description,
            merchantName,
            notes,
            isExcludedFromBudget);
        OriginalDescription = ValidateOptionalText(
            originalDescription,
            OriginalDescriptionMaxLength,
            nameof(originalDescription),
            "Original description");
        LastModifiedByUserId = ValidateRequiredId(
            modifiedByUserId,
            nameof(modifiedByUserId),
            "Modified-by user ID");
        IsVoided = false;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public Guid AccountId { get; private set; }

    public Guid? CategoryId { get; private set; }

    public Guid? ImportFileId { get; private set; }

    public int? ImportRowNumber { get; private set; }

    public DateOnly TransactionDate { get; private set; }

    public DateOnly? PostedDate { get; private set; }

    public decimal Amount { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public string? OriginalDescription { get; private set; }

    public string? MerchantName { get; private set; }

    public string? Notes { get; private set; }

    public TransactionSource Source { get; private set; }

    public TransactionReviewStatus ReviewStatus { get; private set; }

    public bool IsExcludedFromBudget { get; private set; }

    public bool IsVoided { get; private set; }

    public Guid LastModifiedByUserId { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Transaction CreateManual(
        Guid householdId,
        Guid accountId,
        Guid? categoryId,
        DateOnly transactionDate,
        DateOnly? postedDate,
        decimal amount,
        string description,
        string? merchantName,
        string? notes,
        bool isExcludedFromBudget,
        Guid createdByUserId,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            accountId,
            categoryId,
            importFileId: null,
            importRowNumber: null,
            transactionDate,
            postedDate,
            amount,
            description,
            originalDescription: null,
            merchantName,
            notes,
            TransactionSource.Manual,
            TransactionReviewStatus.Reviewed,
            isExcludedFromBudget,
            createdByUserId,
            createdAtUtc);

    public static Transaction CreateAdjustment(
        Guid householdId,
        Guid accountId,
        Guid? categoryId,
        DateOnly transactionDate,
        decimal amount,
        string description,
        string? notes,
        bool isExcludedFromBudget,
        Guid createdByUserId,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            accountId,
            categoryId,
            importFileId: null,
            importRowNumber: null,
            transactionDate,
            postedDate: null,
            amount,
            description,
            originalDescription: null,
            merchantName: null,
            notes,
            TransactionSource.Adjustment,
            TransactionReviewStatus.Reviewed,
            isExcludedFromBudget,
            createdByUserId,
            createdAtUtc);

    public static Transaction CreateImported(
        Guid householdId,
        Guid accountId,
        Guid? categoryId,
        Guid importFileId,
        int importRowNumber,
        DateOnly transactionDate,
        DateOnly? postedDate,
        decimal amount,
        string description,
        string? originalDescription,
        string? merchantName,
        string? notes,
        bool isExcludedFromBudget,
        Guid approvedByUserId,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            accountId,
            categoryId,
            importFileId,
            importRowNumber,
            transactionDate,
            postedDate,
            amount,
            description,
            originalDescription,
            merchantName,
            notes,
            TransactionSource.Import,
            TransactionReviewStatus.Reviewed,
            isExcludedFromBudget,
            approvedByUserId,
            createdAtUtc);

    public void UpdateDetails(
        Guid? categoryId,
        DateOnly transactionDate,
        DateOnly? postedDate,
        decimal amount,
        string description,
        string? merchantName,
        string? notes,
        bool isExcludedFromBudget,
        Guid modifiedByUserId,
        DateTimeOffset updatedAtUtc)
    {
        var validatedModifiedByUserId = ValidateRequiredId(
            modifiedByUserId,
            nameof(modifiedByUserId),
            "Modified-by user ID");

        SetEditableDetails(
            categoryId,
            transactionDate,
            postedDate,
            amount,
            description,
            merchantName,
            notes,
            isExcludedFromBudget);
        LastModifiedByUserId = validatedModifiedByUserId;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void MarkNeedsReview(
        Guid modifiedByUserId,
        DateTimeOffset updatedAtUtc)
    {
        RecordModification(modifiedByUserId, updatedAtUtc);
        ReviewStatus = TransactionReviewStatus.NeedsReview;
    }

    public void MarkReviewed(
        Guid modifiedByUserId,
        DateTimeOffset updatedAtUtc)
    {
        RecordModification(modifiedByUserId, updatedAtUtc);
        ReviewStatus = TransactionReviewStatus.Reviewed;
    }

    public void Void(Guid modifiedByUserId, DateTimeOffset updatedAtUtc)
    {
        RecordModification(modifiedByUserId, updatedAtUtc);
        IsVoided = true;
    }

    public void Restore(Guid modifiedByUserId, DateTimeOffset updatedAtUtc)
    {
        RecordModification(modifiedByUserId, updatedAtUtc);
        IsVoided = false;
    }

    private void SetEditableDetails(
        Guid? categoryId,
        DateOnly transactionDate,
        DateOnly? postedDate,
        decimal amount,
        string description,
        string? merchantName,
        string? notes,
        bool isExcludedFromBudget)
    {
        var validatedCategoryId = ValidateOptionalId(
            categoryId,
            nameof(categoryId),
            "Category ID");
        var validatedAmount = ValidateAmount(amount);
        var validatedDescription = ValidateRequiredText(
            description,
            DescriptionMaxLength,
            nameof(description),
            "Description");
        var validatedMerchantName = ValidateOptionalText(
            merchantName,
            MerchantNameMaxLength,
            nameof(merchantName),
            "Merchant name");
        var validatedNotes = ValidateOptionalText(
            notes,
            NotesMaxLength,
            nameof(notes),
            "Notes");

        CategoryId = validatedCategoryId;
        TransactionDate = transactionDate;
        PostedDate = postedDate;
        Amount = validatedAmount;
        Description = validatedDescription;
        MerchantName = validatedMerchantName;
        Notes = validatedNotes;
        IsExcludedFromBudget = isExcludedFromBudget;
    }

    private void SetImportReference(Guid? importFileId, int? importRowNumber)
    {
        if (Source == TransactionSource.Import)
        {
            ImportFileId = ValidateRequiredId(
                importFileId ?? Guid.Empty,
                nameof(importFileId),
                "Import file ID");
            if (!importRowNumber.HasValue || importRowNumber.Value <= 0)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(importRowNumber),
                    "Import row number must be positive.");
            }

            ImportRowNumber = importRowNumber;
            return;
        }

        if (importFileId.HasValue || importRowNumber.HasValue)
        {
            throw new ArgumentException(
                "Only imported transactions can reference an import row.",
                nameof(importFileId));
        }

        ImportFileId = null;
        ImportRowNumber = null;
    }

    private void RecordModification(
        Guid modifiedByUserId,
        DateTimeOffset updatedAtUtc)
    {
        LastModifiedByUserId = ValidateRequiredId(
            modifiedByUserId,
            nameof(modifiedByUserId),
            "Modified-by user ID");
        UpdatedAtUtc = updatedAtUtc;
    }

    private static decimal ValidateAmount(decimal amount)
    {
        if (amount == 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(amount),
                "Transaction amount cannot be zero.");
        }

        if (decimal.Round(amount, 4) != amount)
        {
            throw new ArgumentOutOfRangeException(
                nameof(amount),
                "Transaction amount cannot have more than four decimal places.");
        }

        if (decimal.Abs(amount) > MaxAbsoluteAmount)
        {
            throw new ArgumentOutOfRangeException(
                nameof(amount),
                $"Transaction amount cannot exceed {MaxAbsoluteAmount} in absolute value.");
        }

        return amount;
    }

    private static TransactionSource ValidateSource(TransactionSource source)
    {
        if (!Enum.IsDefined(source))
        {
            throw new ArgumentOutOfRangeException(
                nameof(source),
                "Transaction source is not supported.");
        }

        return source;
    }

    private static TransactionReviewStatus ValidateReviewStatus(
        TransactionReviewStatus reviewStatus)
    {
        if (!Enum.IsDefined(reviewStatus))
        {
            throw new ArgumentOutOfRangeException(
                nameof(reviewStatus),
                "Transaction review status is not supported.");
        }

        return reviewStatus;
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

    private static Guid? ValidateOptionalId(
        Guid? value,
        string parameterName,
        string displayName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException(
                $"{displayName} cannot be empty when provided.",
                parameterName);
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

    private static string? ValidateOptionalText(
        string? value,
        int maxLength,
        string parameterName,
        string displayName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
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
