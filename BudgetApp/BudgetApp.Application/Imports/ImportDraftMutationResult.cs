namespace BudgetApp.Application.Imports;

public sealed record ImportDraftMutationResult(
    ImportReviewSummary Summary, IReadOnlyList<ImportDraftItem> Items,
    IReadOnlyList<Guid> RemovedDraftIds, int SavedRows);

public sealed class ImportReviewConflictException()
    : InvalidOperationException("This import changed since it was loaded. Reload the affected rows before trying again.");
