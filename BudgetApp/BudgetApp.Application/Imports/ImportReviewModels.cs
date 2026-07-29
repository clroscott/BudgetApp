namespace BudgetApp.Application.Imports;

public sealed record ImportDraftUpdateInput(
    Guid DraftId,
    DateOnly? TransactionDate,
    decimal? Amount,
    string? Description,
    Guid? SelectedCategoryId);

public sealed record ImportListItem(
    Guid Id,
    string OriginalFileName,
    string AccountName,
    string Status,
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    int ApprovedRows,
    int RejectedRows,
    int SkippedRows,
    int DuplicateRows,
    DateTimeOffset UploadedAtUtc,
    bool CanEdit);

public sealed record ImportDraftItem(
    Guid Id,
    int SourceRowNumber,
    DateOnly? TransactionDate,
    decimal? Amount,
    string? Description,
    string? ImportedCategoryName,
    string? ImportedSubcategoryName,
    Guid? SelectedCategoryId,
    string ValidationStatus,
    string? ValidationMessage,
    string DuplicateStatus,
    Guid? PossibleMatchingTransactionId,
    string ReviewDecision,
    bool IsDuplicateAcknowledged,
    Guid? ApprovedTransactionId);

public sealed record ImportReviewDetail(
    Guid Id,
    string OriginalFileName,
    string AccountName,
    string Currency,
    string Status,
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    int ApprovedRows,
    int RejectedRows,
    int SkippedRows,
    int DuplicateRows,
    bool CanEdit,
    IReadOnlyList<ImportDraftItem> Drafts);

public sealed record CompleteImportResult(
    Guid ImportFileId,
    int CreatedTransactionCount,
    int ApprovedRows,
    int RejectedRows,
    int SkippedRows,
    string Status);
