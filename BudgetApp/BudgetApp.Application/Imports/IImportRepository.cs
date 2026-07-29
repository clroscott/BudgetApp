using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public interface IImportRepository
{
    Task<IReadOnlyList<ImportListRecord>> ListVisibleAsync(
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

    Task<IReadOnlyList<DuplicateCandidate>> ListDuplicateCandidatesAsync(
        Guid accountId,
        DateOnly fromDate,
        DateOnly toDate,
        CancellationToken cancellationToken);

    Task<bool> ExistsByAccountAndHashAsync(
        Guid accountId,
        string sha256Hash,
        CancellationToken cancellationToken);

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
    Guid? AccountOwnerUserId);

public sealed record DuplicateCandidate(
    Guid TransactionId,
    DateOnly TransactionDate,
    decimal Amount,
    string Description);
