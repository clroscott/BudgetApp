namespace BudgetApp.Application.Imports;

public sealed record ImportDraftUpdateInput(
    Guid DraftId,
    DateOnly? TransactionDate,
    decimal? Amount,
    string? Description,
    Guid? SelectedCategoryId,
    bool? IncludeInHouseholdBudget = null,
    bool? IncludeInPersonalBudget = null);

public sealed record ImportListItem(
    Guid Id,
    string OriginalFileName,
    string AccountName,
    string Status,
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    int ApprovedRows,
    int ExcludedRows,
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
    Guid? ApprovedTransactionId,
    bool IncludeInHouseholdBudget,
    bool IncludeInPersonalBudget,
    bool CanChangePersonalInclusion,
    bool CanChangeHouseholdInclusion);

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
    int ExcludedRows,
    int DuplicateRows,
    bool CanEdit,
    IReadOnlyList<ImportDraftItem> Drafts);

public sealed record CompleteImportResult(
    Guid ImportFileId,
    int CreatedTransactionCount,
    int ApprovedRows,
    int ExcludedRows,
    string Status);

public sealed record ApplyCategorizationRulesResult(
    int MatchedRows,
    int ChangedRows,
    int UnchangedRows);

public sealed record CategorizationRuleApplicationPreview(
    int FillChangedRows,
    int ReapplyChangedRows,
    int ReapplyUnchangedRows);
