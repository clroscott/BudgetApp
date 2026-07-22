using BudgetApp.Domain.Transactions;

namespace BudgetApp.Domain.Imports;

public sealed class ImportTransactionDraft
{
    public const int RawDataMaxLength = 16000;
    public const int ParsedDescriptionMaxLength =
        Transaction.OriginalDescriptionMaxLength;
    public const int ValidationMessageMaxLength = 2000;

    private ImportTransactionDraft()
    {
    }

    private ImportTransactionDraft(
        Guid id,
        Guid importFileId,
        int sourceRowNumber,
        string rawData,
        DateOnly? parsedTransactionDate,
        decimal? parsedAmount,
        string? parsedDescription,
        string? originalValidationMessage,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        ImportFileId = ValidateRequiredId(
            importFileId,
            nameof(importFileId),
            "Import file ID");
        SourceRowNumber = ValidateSourceRowNumber(sourceRowNumber);
        RawData = ValidateRequiredText(
            rawData,
            RawDataMaxLength,
            nameof(rawData),
            "Raw row data");
        OriginalTransactionDate = parsedTransactionDate;
        OriginalAmount = parsedAmount;
        OriginalDescription = ValidateOptionalText(
            parsedDescription,
            ParsedDescriptionMaxLength,
            nameof(parsedDescription),
            "Parsed description");
        OriginalValidationMessage = ValidateOptionalText(
            originalValidationMessage,
            ValidationMessageMaxLength,
            nameof(originalValidationMessage),
            "Original validation message");

        TransactionDate = OriginalTransactionDate;
        Amount = OriginalAmount;
        Description = OriginalDescription;
        SuggestedCategoryId = null;
        SelectedCategoryId = null;
        DuplicateStatus = ImportDraftDuplicateStatus.NotChecked;
        PossibleMatchingTransactionId = null;
        ReviewDecision = ImportDraftReviewDecision.Pending;
        IsDuplicateAcknowledged = false;
        ReviewedByUserId = null;
        ReviewedAtUtc = null;
        ApprovedTransactionId = null;
        ApplyValidation(OriginalValidationMessage);
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid ImportFileId { get; private set; }

    public int SourceRowNumber { get; private set; }

    public string RawData { get; private set; } = string.Empty;

    public DateOnly? OriginalTransactionDate { get; private set; }

    public decimal? OriginalAmount { get; private set; }

    public string? OriginalDescription { get; private set; }

    public string? OriginalValidationMessage { get; private set; }

    public DateOnly? TransactionDate { get; private set; }

    public decimal? Amount { get; private set; }

    public string? Description { get; private set; }

    public Guid? SuggestedCategoryId { get; private set; }

    public Guid? SelectedCategoryId { get; private set; }

    public ImportDraftValidationStatus ValidationStatus { get; private set; }

    public string? ValidationMessage { get; private set; }

    public ImportDraftDuplicateStatus DuplicateStatus { get; private set; }

    public Guid? PossibleMatchingTransactionId { get; private set; }

    public ImportDraftReviewDecision ReviewDecision { get; private set; }

    public bool IsDuplicateAcknowledged { get; private set; }

    public Guid? ReviewedByUserId { get; private set; }

    public DateTimeOffset? ReviewedAtUtc { get; private set; }

    public Guid? ApprovedTransactionId { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static ImportTransactionDraft Create(
        Guid importFileId,
        int sourceRowNumber,
        string rawData,
        DateOnly? parsedTransactionDate,
        decimal? parsedAmount,
        string? parsedDescription,
        string? validationMessage,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            importFileId,
            sourceRowNumber,
            rawData,
            parsedTransactionDate,
            parsedAmount,
            parsedDescription,
            validationMessage,
            createdAtUtc);

    public void CorrectParsedValues(
        DateOnly? transactionDate,
        decimal? amount,
        string? description,
        Guid? selectedCategoryId,
        DateTimeOffset updatedAtUtc)
    {
        EnsureNotLinked();

        var validatedDescription = ValidateOptionalText(
            description,
            ParsedDescriptionMaxLength,
            nameof(description),
            "Description");
        var validatedCategoryId = ValidateOptionalId(
            selectedCategoryId,
            nameof(selectedCategoryId),
            "Selected category ID");

        TransactionDate = transactionDate;
        Amount = amount;
        Description = validatedDescription;
        SelectedCategoryId = validatedCategoryId;
        ApplyValidation(parserMessage: null);
        ResetReview();
        UpdatedAtUtc = updatedAtUtc;
    }

    public void SetSuggestedCategory(
        Guid? suggestedCategoryId,
        DateTimeOffset updatedAtUtc)
    {
        EnsureNotLinked();
        SuggestedCategoryId = ValidateOptionalId(
            suggestedCategoryId,
            nameof(suggestedCategoryId),
            "Suggested category ID");
        UpdatedAtUtc = updatedAtUtc;
    }

    public void SetDuplicateResult(
        ImportDraftDuplicateStatus duplicateStatus,
        Guid? possibleMatchingTransactionId,
        DateTimeOffset updatedAtUtc)
    {
        EnsureNotLinked();

        if (!Enum.IsDefined(duplicateStatus))
        {
            throw new ArgumentOutOfRangeException(
                nameof(duplicateStatus),
                "Duplicate status is not supported.");
        }

        var validatedMatchId = ValidateOptionalId(
            possibleMatchingTransactionId,
            nameof(possibleMatchingTransactionId),
            "Possible matching transaction ID");
        if (duplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate &&
            !validatedMatchId.HasValue)
        {
            throw new ArgumentException(
                "A possible duplicate must reference its possible matching transaction.",
                nameof(possibleMatchingTransactionId));
        }

        if (duplicateStatus != ImportDraftDuplicateStatus.PossibleDuplicate &&
            validatedMatchId.HasValue)
        {
            throw new ArgumentException(
                "Only a possible duplicate can reference a matching transaction.",
                nameof(possibleMatchingTransactionId));
        }

        DuplicateStatus = duplicateStatus;
        PossibleMatchingTransactionId = validatedMatchId;
        ResetReview();
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Approve(
        Guid reviewedByUserId,
        bool acknowledgePossibleDuplicate,
        DateTimeOffset reviewedAtUtc)
    {
        EnsureNotLinked();

        if (ValidationStatus != ImportDraftValidationStatus.Valid)
        {
            throw new InvalidOperationException(
                "An invalid import row cannot be approved.");
        }

        if (DuplicateStatus == ImportDraftDuplicateStatus.NotChecked)
        {
            throw new InvalidOperationException(
                "Duplicate detection must run before an import row can be approved.");
        }

        if (DuplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate &&
            !acknowledgePossibleDuplicate)
        {
            throw new InvalidOperationException(
                "A possible duplicate must be explicitly acknowledged before approval.");
        }

        SetReviewDecision(
            ImportDraftReviewDecision.Approved,
            reviewedByUserId,
            reviewedAtUtc);
        IsDuplicateAcknowledged =
            DuplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate;
    }

    public void Reject(Guid reviewedByUserId, DateTimeOffset reviewedAtUtc)
    {
        EnsureNotLinked();
        SetReviewDecision(
            ImportDraftReviewDecision.Rejected,
            reviewedByUserId,
            reviewedAtUtc);
    }

    public void Skip(Guid reviewedByUserId, DateTimeOffset reviewedAtUtc)
    {
        EnsureNotLinked();
        SetReviewDecision(
            ImportDraftReviewDecision.Skipped,
            reviewedByUserId,
            reviewedAtUtc);
    }

    public void LinkApprovedTransaction(
        Transaction transaction,
        DateTimeOffset updatedAtUtc)
    {
        ArgumentNullException.ThrowIfNull(transaction);

        if (ApprovedTransactionId.HasValue)
        {
            if (ApprovedTransactionId.Value == transaction.Id)
            {
                return;
            }

            throw new InvalidOperationException(
                "This import row is already linked to another transaction.");
        }

        if (ReviewDecision != ImportDraftReviewDecision.Approved)
        {
            throw new InvalidOperationException(
                "Only an approved import row can link to an official transaction.");
        }

        if (transaction.Source != TransactionSource.Import ||
            transaction.ImportFileId != ImportFileId ||
            transaction.ImportRowNumber != SourceRowNumber)
        {
            throw new ArgumentException(
                "The transaction must have matching import-file and source-row provenance.",
                nameof(transaction));
        }

        ApprovedTransactionId = transaction.Id;
        UpdatedAtUtc = updatedAtUtc;
    }

    private void ApplyValidation(string? parserMessage)
    {
        var messages = new List<string>();
        if (!string.IsNullOrWhiteSpace(parserMessage))
        {
            messages.Add(parserMessage.Trim());
        }

        if (!TransactionDate.HasValue)
        {
            messages.Add("Transaction date is required.");
        }

        if (!Amount.HasValue)
        {
            messages.Add("Amount is required.");
        }
        else
        {
            if (Amount.Value == 0)
            {
                messages.Add("Amount cannot be zero.");
            }

            if (decimal.Round(Amount.Value, 4) != Amount.Value)
            {
                messages.Add("Amount cannot have more than four decimal places.");
            }

            if (decimal.Abs(Amount.Value) > Transaction.MaxAbsoluteAmount)
            {
                messages.Add(
                    $"Amount cannot exceed {Transaction.MaxAbsoluteAmount} in absolute value.");
            }
        }

        if (string.IsNullOrWhiteSpace(Description))
        {
            messages.Add("Description is required.");
        }
        else if (Description.Length > Transaction.DescriptionMaxLength)
        {
            messages.Add(
                $"Description cannot exceed {Transaction.DescriptionMaxLength} characters.");
        }

        ValidationMessage = messages.Count == 0
            ? null
            : LimitValidationMessage(string.Join(" ", messages.Distinct()));
        ValidationStatus = ValidationMessage is null
            ? ImportDraftValidationStatus.Valid
            : ImportDraftValidationStatus.Invalid;
    }

    private void SetReviewDecision(
        ImportDraftReviewDecision reviewDecision,
        Guid reviewedByUserId,
        DateTimeOffset reviewedAtUtc)
    {
        var validatedUserId = ValidateRequiredId(
            reviewedByUserId,
            nameof(reviewedByUserId),
            "Reviewed-by user ID");

        ReviewDecision = reviewDecision;
        ReviewedByUserId = validatedUserId;
        ReviewedAtUtc = reviewedAtUtc;
        IsDuplicateAcknowledged = false;
        UpdatedAtUtc = reviewedAtUtc;
    }

    private void ResetReview()
    {
        ReviewDecision = ImportDraftReviewDecision.Pending;
        IsDuplicateAcknowledged = false;
        ReviewedByUserId = null;
        ReviewedAtUtc = null;
    }

    private void EnsureNotLinked()
    {
        if (ApprovedTransactionId.HasValue)
        {
            throw new InvalidOperationException(
                "An import row linked to an official transaction can no longer be changed.");
        }
    }

    private static int ValidateSourceRowNumber(int sourceRowNumber)
    {
        if (sourceRowNumber <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(sourceRowNumber),
                "Source row number must be positive.");
        }

        return sourceRowNumber;
    }

    private static string LimitValidationMessage(string message)
    {
        if (message.Length <= ValidationMessageMaxLength)
        {
            return message;
        }

        return string.Concat(
            message.AsSpan(0, ValidationMessageMaxLength - 1),
            "…");
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
