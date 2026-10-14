using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

// Mirrors the existing review screen filters. ParentOnly means a category with
// children, not every root category (a root without children is fully specified).
public enum ImportDraftFilter
{
    All, Pending, Uncategorized, ParentOnly, Categorized, PossibleDuplicates,
    Invalid, Approved, Excluded
}

public sealed record ImportDraftCounts(
    int TotalRows, int ValidRows, int InvalidRows, int ApprovedRows, int ExcludedRows,
    int DuplicateRows, int PendingRows, int UncheckedDuplicateRows, int ValidPendingRows)
{
    public static ImportDraftCounts Empty { get; } = new(0, 0, 0, 0, 0, 0, 0, 0, 0);
}

public sealed record ImportReviewSummary(
    Guid Id, string OriginalFileName, string AccountName, string Currency, string Status,
    bool CanEdit, ImportDraftCounts Counts, string? SourceWorksheetName,
    DateTimeOffset UpdatedAtUtc);

public sealed record ImportDraftPageResult(
    ImportReviewSummary Summary, IReadOnlyList<ImportDraftItem> Items,
    string Filter, int Page, int PageSize, int TotalCount, int TotalPages);

public sealed record ImportDraftPageQueryResult(
    IReadOnlyList<ImportDraftReadRecord> Items, int Page, int TotalCount);

public sealed record ImportBudgetChoiceCandidate(
    Guid Id, DateOnly? TransactionDate, decimal? Amount, string? Description,
    Guid? SelectedCategoryId, bool IncludeInHouseholdBudget, bool IncludeInPersonalBudget);

public sealed record ImportRuleMatchingDraft(string? Description, Guid? SelectedCategoryId);

// Explicit bulk preview only: return correction baselines for changed/locally edited
// rows, never raw uploads or every unchanged row in a large import.
public sealed record ImportBudgetChoicePreview(
    IReadOnlyList<ImportBudgetChoiceCandidate> Items, int Skipped, int Unchanged,
    DateTimeOffset UpdatedAtUtc);

// Read projection: original parsed values, review audit columns and tracked
// entities are unnecessary. RawData is retained internally for legacy label
// parity, but only for the bounded page; it never enters the response contract.
public readonly record struct ImportDraftReadRecord(
    Guid Id, int SourceRowNumber, string RawData, DateOnly? TransactionDate,
    decimal? Amount, string? Description, Guid? SelectedCategoryId,
    ImportDraftValidationStatus ValidationStatus, string? ValidationMessage,
    ImportDraftDuplicateStatus DuplicateStatus, Guid? PossibleMatchingTransactionId,
    ImportDraftReviewDecision ReviewDecision, bool IsDuplicateAcknowledged,
    Guid? ApprovedTransactionId, bool? IncludeInHouseholdBudget, Guid? PersonalBudgetUserId)
{
    public static ImportDraftReadRecord FromDraft(ImportTransactionDraft draft) => new(
        draft.Id, draft.SourceRowNumber, draft.RawData, draft.TransactionDate, draft.Amount,
        draft.Description, draft.SelectedCategoryId, draft.ValidationStatus, draft.ValidationMessage,
        draft.DuplicateStatus, draft.PossibleMatchingTransactionId, draft.ReviewDecision,
        draft.IsDuplicateAcknowledged, draft.ApprovedTransactionId,
        draft.IncludeInHouseholdBudget, draft.PersonalBudgetUserId);
}
