using BudgetApp.Application.Imports;
using BudgetApp.Application.Auditing;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace BudgetApp.Infrastructure.Imports;

internal sealed class ImportReversalRepository(BudgetAppDbContext db) : IImportReversalRepository
{
    public async Task<T> ExecuteAtomicAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken ct)
    {
        // No automatic command retries: a lost response is reconciled with GET.
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var result = await operation(ct);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<ImportReversalSnapshot> GetSnapshotAsync(Guid importFileId, int maxRows, CancellationToken ct, bool forUpdate = false)
    {
        var drafts = await db.ImportTransactionDrafts.AsNoTracking()
            .Where(d => d.ImportFileId == importFileId).OrderBy(d => d.SourceRowNumber).ThenBy(d => d.Id)
            .Take(maxRows + 1)
            .Select(d => new ImportReversalDraftRecord(d.Id, d.SourceRowNumber, d.ReviewDecision,
                d.ApprovedTransactionId, d.TransactionDate, d.Amount, d.Description, d.OriginalDescription,
                d.SelectedCategoryId, d.IncludeInHouseholdBudget, d.PersonalBudgetUserId, d.UpdatedAtUtc))
            .ToListAsync(ct);
        // Include unexpected/mismatched links in the safety check, but the service
        // never exposes their financial values. No parameter list proportional to
        // the file size, raw workbook contents, or tracked entities are required.
        var relevant = (forUpdate ? db.Transactions.AsTracking() : db.Transactions.AsNoTracking())
            .Where(t => t.ImportFileId == importFileId || db.ImportTransactionDrafts.Any(d =>
                d.ImportFileId == importFileId && d.ApprovedTransactionId == t.Id));
        var transactions = await relevant.Include(t => t.PersonalBudgetInclusions)
            .OrderBy(t => t.Id).Take(maxRows + 1)
            .Select(t => new ImportReversalTransactionRecord(t, false,
                db.ImportTransactionDrafts.Any(d => d.ApprovedTransactionId == t.Id && d.ImportFileId != importFileId)))
            .AsSplitQuery().ToListAsync(ct);
        // Scan matching audit identities once rather than a correlated audit scan
        // per row. Reverted edits still block undo even when values/times match.
        var changedIds = (await db.AuditEvents.AsNoTracking().Where(a =>
                a.EntityType == AuditEntityTypes.Transaction && a.Action != AuditActions.Created &&
                relevant.Any(t => t.Id == a.EntityId))
            .Select(a => a.EntityId).Distinct().Take(maxRows + 1).ToListAsync(ct)).ToHashSet();
        return new(drafts, transactions.Select(record => record with {
            HasRecordedChanges = changedIds.Contains(record.Transaction.Id)
        }).ToList());
    }
}
