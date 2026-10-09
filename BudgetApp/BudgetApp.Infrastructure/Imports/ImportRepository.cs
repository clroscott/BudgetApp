using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Imports;

internal sealed class ImportRepository(BudgetAppDbContext dbContext)
    : IImportRepository
{
    public async Task<ImportListQueryResult> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        ImportListFilter filter,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var summary = await GetSummaryAsync(householdId, userId, cancellationToken);
        var total = filter switch
        {
            ImportListFilter.Unfinished => summary.UnfinishedCount,
            ImportListFilter.Completed => summary.TotalCount - summary.UnfinishedCount,
            ImportListFilter.ReadyForReview => summary.ReadyForReviewCount,
            _ => summary.TotalCount
        };
        var lastPage = Math.Max(1, (int)Math.Ceiling((double)total / pageSize));
        var actualPage = Math.Min(page, lastPage);
        var query = VisibleImports(householdId, userId);
        query = filter switch
        {
            ImportListFilter.Unfinished => query.Where(item => item.File.Status != ImportFileStatus.Completed),
            ImportListFilter.Completed => query.Where(item => item.File.Status == ImportFileStatus.Completed),
            ImportListFilter.ReadyForReview => query.Where(item => item.File.Status == ImportFileStatus.ReadyForReview),
            _ => query
        };
        var items = await query.OrderByDescending(item => item.File.UploadedAtUtc)
            .ThenByDescending(item => item.File.Id)
            .Skip((actualPage - 1) * pageSize).Take(pageSize)
            .Select(item => new ImportListRecord(
                item.File.Id,
                item.File.OriginalFileName,
                item.Account.Name,
                item.File.Status.ToString(),
                item.File.TotalRowCount,
                item.File.ValidRowCount,
                item.File.InvalidRowCount,
                item.File.ApprovedRowCount,
                item.File.ExcludedRowCount,
                item.File.DuplicateRowCount,
                item.File.UploadedAtUtc,
                item.Account.Scope == AccountScope.Personal,
                item.Account.OwnerUserId,
                item.File.SourceWorksheetName))
            .ToListAsync(cancellationToken);
        return new ImportListQueryResult(items, actualPage, total, summary.TotalCount);
    }

    public async Task<ImportSummary> GetSummaryAsync(Guid householdId, Guid userId, CancellationToken cancellationToken) =>
        await VisibleImports(householdId, userId).GroupBy(_ => 1)
            .Select(group => new ImportSummary(group.Count(),
                group.Count(item => item.File.Status != ImportFileStatus.Completed),
                group.Count(item => item.File.Status == ImportFileStatus.ReadyForReview)))
            .SingleOrDefaultAsync(cancellationToken) ?? new ImportSummary(0, 0, 0);

    private IQueryable<VisibleImport> VisibleImports(Guid householdId, Guid userId) =>
        (
            from importFile in dbContext.ImportFiles.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on importFile.AccountId equals account.Id
            where importFile.HouseholdId == householdId &&
                  (account.Scope == AccountScope.Household || account.OwnerUserId == userId)
            select new VisibleImport { File = importFile, Account = account });

    private sealed class VisibleImport
    {
        public required ImportFile File { get; init; }
        public required Account Account { get; init; }
    }

    public async Task<ImportAccessRecord?> GetAccessAsync(
        Guid householdId,
        Guid importFileId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var importFile = await (forUpdate
                ? dbContext.ImportFiles
                : dbContext.ImportFiles.AsNoTracking())
            .SingleOrDefaultAsync(
                candidate =>
                    candidate.HouseholdId == householdId &&
                    candidate.Id == importFileId,
                cancellationToken);
        if (importFile is null)
        {
            return null;
        }

        var account = await dbContext.Accounts.AsNoTracking().SingleAsync(
            candidate => candidate.Id == importFile.AccountId,
            cancellationToken);
        return new ImportAccessRecord(
            importFile,
            account.Name,
            account.Currency,
            account.Scope == AccountScope.Personal,
            account.OwnerUserId);
    }

    public async Task<IReadOnlyList<ImportTransactionDraft>> ListDraftsAsync(
        Guid importFileId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var drafts = forUpdate
            ? dbContext.ImportTransactionDrafts
            : dbContext.ImportTransactionDrafts.AsNoTracking();
        return await drafts
            .Where(draft => draft.ImportFileId == importFileId)
            .OrderBy(draft => draft.SourceRowNumber)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DuplicateCandidate>> ListDuplicateCandidatesAsync(
        Guid accountId,
        DateOnly fromDate,
        DateOnly toDate,
        CancellationToken cancellationToken)
    {
        return await dbContext.Transactions.AsNoTracking()
            .Where(transaction =>
                transaction.AccountId == accountId &&
                transaction.TransactionDate >= fromDate &&
                transaction.TransactionDate <= toDate &&
                !transaction.IsVoided)
            .Select(transaction => new DuplicateCandidate(
                transaction.Id,
                transaction.TransactionDate,
                transaction.Amount,
                transaction.Description))
            .ToListAsync(cancellationToken);
    }

    public Task<bool> ExistsByAccountAndHashAsync(
        Guid accountId,
        string sha256Hash,
        CancellationToken cancellationToken, string? sourceWorksheetId = null) =>
        dbContext.ImportFiles.AsNoTracking().AnyAsync(
            importFile =>
                importFile.AccountId == accountId &&
                importFile.Sha256Hash == sha256Hash && importFile.SourceWorksheetId == sourceWorksheetId,
            cancellationToken);

    public async Task AddAsync(
        ImportFile importFile,
        IReadOnlyCollection<ImportTransactionDraft> drafts,
        CancellationToken cancellationToken)
    {
        await dbContext.ImportFiles.AddAsync(importFile, cancellationToken);
        await dbContext.ImportTransactionDrafts.AddRangeAsync(
            drafts,
            cancellationToken);
    }

    public async Task AddTransactionsAsync(
        IReadOnlyCollection<Transaction> transactions,
        CancellationToken cancellationToken)
    {
        await dbContext.Transactions.AddRangeAsync(transactions, cancellationToken);
    }

    public void Remove(ImportFile importFile) =>
        dbContext.ImportFiles.Remove(importFile);

    public void RemoveDraft(ImportTransactionDraft draft) =>
        dbContext.ImportTransactionDrafts.Remove(draft);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
