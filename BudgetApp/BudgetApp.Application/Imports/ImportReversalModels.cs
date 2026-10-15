using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;

namespace BudgetApp.Application.Imports;

// An advisory read, never a reservation or authorization to execute a write.
public sealed record ImportReversalPreview(
    Guid ImportFileId, string OriginalFileName, string AccountName, string Currency,
    string? SourceWorksheetName, DateTimeOffset ImportUpdatedAtUtc, DateTimeOffset CheckedAtUtc,
    bool CanReverse, int LinkedTransactionCount, int EligibleRowCount, int BlockedRowCount,
    IReadOnlyList<string> BlockingReasons, IReadOnlyList<ImportReversalPreviewRow> Items,
    int Page, int PageSize, int TotalCount, int TotalPages,
    string PreviewVersion = "", string Status = "Completed");

public sealed record ReverseImportResult(Guid ImportFileId, string Status, int ReversedTransactionCount,
    DateTimeOffset UpdatedAtUtc, bool AlreadyReversed);

public sealed class ImportReversalConflictException(string message) : InvalidOperationException(message);

public sealed record ImportReversalPreviewRow(
    Guid? DraftId, int? SourceRowNumber, Guid? TransactionId,
    DateOnly? TransactionDate, decimal? Amount, string? Description,
    DateTimeOffset? DraftUpdatedAtUtc, DateTimeOffset? TransactionUpdatedAtUtc,
    bool IsEligible, IReadOnlyList<string> BlockingReasons);

// No RawData/CSV/workbook contents are loaded for this explicit preview.
public sealed record ImportReversalDraftRecord(
    Guid Id, int SourceRowNumber, ImportDraftReviewDecision Decision, Guid? TransactionId,
    DateOnly? Date, decimal? Amount, string? Description, string? OriginalDescription,
    Guid? CategoryId, bool? IncludeHousehold, Guid? PersonalUserId, DateTimeOffset UpdatedAtUtc);

public sealed record ImportReversalTransactionRecord(
    Transaction Transaction, bool HasRecordedChanges, bool HasOtherApprovalLinks);

public sealed record ImportReversalSnapshot(
    IReadOnlyList<ImportReversalDraftRecord> Drafts,
    IReadOnlyList<ImportReversalTransactionRecord> Transactions);

public interface IImportReversalRepository
{
    Task<ImportReversalSnapshot> GetSnapshotAsync(Guid importFileId, int maxRows, CancellationToken cancellationToken, bool forUpdate = false);
    Task<T> ExecuteAtomicAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken);
}
