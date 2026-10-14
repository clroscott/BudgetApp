using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public interface IImportRepository
{
    Task<ImportListQueryResult> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        ImportListFilter filter,
        int page,
        int pageSize,
        CancellationToken cancellationToken);

    Task<ImportSummary> GetSummaryAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken);

    Task<ImportAccessRecord?> GetAccessAsync(
        Guid householdId,
        Guid importFileId,
        bool forUpdate,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<ImportTransactionDraft>> ListDraftsAsync(
        Guid importFileId,
        bool forUpdate,
        CancellationToken cancellationToken);

    Task<ImportDraftCounts> GetDraftCountsAsync(Guid importFileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ImportRuleMatchingDraft>> ListRuleMatchingDraftsAsync(Guid importFileId, CancellationToken cancellationToken);

    Task<IReadOnlyList<ImportTransactionDraft>> GetDraftsForUpdateAsync(
        Guid importFileId, IReadOnlyCollection<Guid> draftIds, CancellationToken cancellationToken);

    Task<ImportDraftPageQueryResult> ListDraftPageAsync(
        Guid importFileId, Guid householdId, ImportDraftFilter filter,
        int page, int pageSize, CancellationToken cancellationToken);

    Task<ImportBudgetChoicePreview> PreviewBudgetChoicesAsync(
        Guid importFileId, Guid householdId, Guid userId, ImportDraftFilter filter,
        bool personal, bool household, bool isPersonalAccount, bool canChangeHousehold,
        IReadOnlyCollection<Guid> editedDraftIds, CancellationToken cancellationToken);

    Task<IReadOnlyList<DuplicateCandidate>> ListDuplicateCandidatesAsync(
        Guid accountId,
        DateOnly fromDate,
        DateOnly toDate,
        CancellationToken cancellationToken);

    Task<bool> ExistsByAccountAndHashAsync(
        Guid accountId,
        string sha256Hash,
        CancellationToken cancellationToken,
        string? sourceWorksheetId = null);

    Task AddAsync(
        ImportFile importFile,
        IReadOnlyCollection<ImportTransactionDraft> drafts,
        CancellationToken cancellationToken);

    Task AddTransactionsAsync(
        IReadOnlyCollection<BudgetApp.Domain.Transactions.Transaction> transactions,
        CancellationToken cancellationToken);

    void Remove(ImportFile importFile);

    void RemoveDraft(ImportTransactionDraft draft);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public sealed record ImportAccessRecord(
    ImportFile ImportFile,
    string AccountName,
    string Currency,
    bool IsPersonalAccount,
    Guid? AccountOwnerUserId);

public sealed record ImportListRecord(
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
    bool IsPersonalAccount,
    Guid? AccountOwnerUserId,
    string? SourceWorksheetName = null);

public sealed record DuplicateCandidate(
    Guid TransactionId,
    DateOnly TransactionDate,
    decimal Amount,
    string Description);
