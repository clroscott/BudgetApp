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
    public async Task<IReadOnlyList<ImportListRecord>> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        return await (
            from importFile in dbContext.ImportFiles.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on importFile.AccountId equals account.Id
            where importFile.HouseholdId == householdId &&
                  (account.Scope == AccountScope.Household || account.OwnerUserId == userId)
            select new ImportListRecord(
                importFile.Id,
                importFile.OriginalFileName,
                account.Name,
                importFile.Status.ToString(),
                importFile.TotalRowCount,
                importFile.ValidRowCount,
                importFile.InvalidRowCount,
                importFile.ApprovedRowCount,
                importFile.ExcludedRowCount,
                importFile.DuplicateRowCount,
                importFile.UploadedAtUtc,
                account.Scope == AccountScope.Personal,
                account.OwnerUserId))
            .ToListAsync(cancellationToken);
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
        CancellationToken cancellationToken) =>
        dbContext.ImportFiles.AsNoTracking().AnyAsync(
            importFile =>
                importFile.AccountId == accountId &&
                importFile.Sha256Hash == sha256Hash,
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
