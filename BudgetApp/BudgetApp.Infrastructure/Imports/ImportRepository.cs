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
            ImportListFilter.Unfinished => query.Where(item => item.File.Status != ImportFileStatus.Completed && item.File.Status != ImportFileStatus.Reversed),
            ImportListFilter.Completed => query.Where(item => item.File.Status == ImportFileStatus.Completed || item.File.Status == ImportFileStatus.Reversed),
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
                group.Count(item => item.File.Status != ImportFileStatus.Completed && item.File.Status != ImportFileStatus.Reversed),
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

    public async Task<IReadOnlyList<ImportRuleMatchingDraft>> ListRuleMatchingDraftsAsync(Guid importFileId, CancellationToken cancellationToken) =>
        await dbContext.ImportTransactionDrafts.AsNoTracking().Where(draft => draft.ImportFileId == importFileId &&
            (draft.ReviewDecision == ImportDraftReviewDecision.Pending || draft.ReviewDecision == ImportDraftReviewDecision.Approved))
            .Select(draft => new ImportRuleMatchingDraft(draft.Description, draft.SelectedCategoryId)).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ImportTransactionDraft>> GetDraftsForUpdateAsync(
        Guid importFileId, IReadOnlyCollection<Guid> draftIds, CancellationToken cancellationToken)
    {
        var result = new List<ImportTransactionDraft>(draftIds.Count);
        // Bound SQL parameter lists as well as returned rows, including providers
        // that expand Contains into individual parameters (SQL Server has a cap).
        foreach (var ids in draftIds.Distinct().Chunk(500))
            result.AddRange(await dbContext.ImportTransactionDrafts
                .Where(draft => draft.ImportFileId == importFileId && ids.Contains(draft.Id))
                .ToListAsync(cancellationToken));
        return result;
    }

    public async Task<ImportDraftCounts> GetDraftCountsAsync(Guid importFileId, CancellationToken cancellationToken) =>
        await dbContext.ImportTransactionDrafts.AsNoTracking()
            .Where(draft => draft.ImportFileId == importFileId).GroupBy(_ => 1)
            .Select(group => new ImportDraftCounts(
                group.Count(),
                group.Count(draft => draft.ValidationStatus == ImportDraftValidationStatus.Valid),
                group.Count(draft => draft.ValidationStatus == ImportDraftValidationStatus.Invalid),
                group.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Approved),
                group.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Excluded),
                group.Count(draft => draft.DuplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate),
                group.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Pending),
                group.Count(draft => draft.DuplicateStatus == ImportDraftDuplicateStatus.NotChecked),
                group.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Pending &&
                    draft.ValidationStatus == ImportDraftValidationStatus.Valid)))
            .SingleOrDefaultAsync(cancellationToken) ?? ImportDraftCounts.Empty;

    public async Task<ImportDraftPageQueryResult> ListDraftPageAsync(
        Guid importFileId, Guid householdId, ImportDraftFilter filter,
        int page, int pageSize, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(filter)) throw new ArgumentException("Choose a supported row filter.", nameof(filter));
        if (page < 1) throw new ArgumentOutOfRangeException(nameof(page));
        if (pageSize < 1 || pageSize > ImportReviewService.DraftPageSize) throw new ArgumentOutOfRangeException(nameof(pageSize));
        var query = FilterDrafts(importFileId, householdId, filter);
        var total = await query.CountAsync(cancellationToken);
        var lastPage = Math.Max(1, (int)Math.Ceiling((double)total / pageSize));
        var actualPage = Math.Min(page, lastPage);
        var items = await query.OrderBy(draft => draft.SourceRowNumber).ThenBy(draft => draft.Id)
            .Skip((actualPage - 1) * pageSize).Take(pageSize)
            .Select(draft => new ImportDraftReadRecord(
                draft.Id, draft.SourceRowNumber, draft.RawData, draft.TransactionDate, draft.Amount,
                draft.Description, draft.SelectedCategoryId, draft.ValidationStatus, draft.ValidationMessage,
                draft.DuplicateStatus, draft.PossibleMatchingTransactionId, draft.ReviewDecision,
                draft.IsDuplicateAcknowledged, draft.ApprovedTransactionId,
                draft.IncludeInHouseholdBudget, draft.PersonalBudgetUserId))
            .ToListAsync(cancellationToken);
        return new ImportDraftPageQueryResult(items, actualPage, total);
    }

    private IQueryable<ImportTransactionDraft> FilterDrafts(Guid importFileId, Guid householdId, ImportDraftFilter filter)
    {
        var query = dbContext.ImportTransactionDrafts.AsNoTracking()
            .Where(draft => draft.ImportFileId == importFileId);
        return filter switch
        {
            ImportDraftFilter.Pending => query.Where(draft => draft.ReviewDecision == ImportDraftReviewDecision.Pending),
            ImportDraftFilter.Uncategorized => query.Where(draft => draft.SelectedCategoryId == null),
            ImportDraftFilter.ParentOnly => query.Where(draft => dbContext.Categories.Any(parent =>
                parent.Id == draft.SelectedCategoryId && parent.HouseholdId == householdId &&
                dbContext.Categories.Any(child => child.HouseholdId == householdId && child.ParentCategoryId == parent.Id))),
            ImportDraftFilter.Categorized => query.Where(draft => draft.SelectedCategoryId != null),
            ImportDraftFilter.PossibleDuplicates => query.Where(draft => draft.DuplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate),
            ImportDraftFilter.Invalid => query.Where(draft => draft.ValidationStatus == ImportDraftValidationStatus.Invalid),
            ImportDraftFilter.Approved => query.Where(draft => draft.ReviewDecision == ImportDraftReviewDecision.Approved),
            ImportDraftFilter.Excluded => query.Where(draft => draft.ReviewDecision == ImportDraftReviewDecision.Excluded),
            _ => query
        };
    }

    public async Task<ImportBudgetChoicePreview> PreviewBudgetChoicesAsync(
        Guid importFileId, Guid householdId, Guid userId, ImportDraftFilter filter,
        bool personal, bool household, bool isPersonalAccount, bool canChangeHousehold,
        IReadOnlyCollection<Guid> editedDraftIds, CancellationToken cancellationToken)
    {
        var matching = FilterDrafts(importFileId, householdId, filter);
        var eligible = matching.Where(draft => draft.ApprovedTransactionId == null &&
            draft.ReviewDecision != ImportDraftReviewDecision.Excluded &&
            (draft.PersonalBudgetUserId == null || draft.PersonalBudgetUserId == userId) &&
            (canChangeHousehold || (draft.IncludeInHouseholdBudget ?? !isPersonalAccount) == household));
        var skipped = await matching.CountAsync(cancellationToken) - await eligible.CountAsync(cancellationToken);
        var changed = eligible.Where(draft =>
            (draft.IncludeInHouseholdBudget ?? !isPersonalAccount) != household ||
            (draft.IncludeInHouseholdBudget.HasValue ? draft.PersonalBudgetUserId == userId : isPersonalAccount) != personal);
        // Keep parameter lists bounded. A local edit must also be returned when
        // saved flags already match, so a second bulk choice can undo the first.
        var ids = editedDraftIds.Distinct().ToArray();
        var items = await BudgetCandidates(changed, userId, isPersonalAccount).ToListAsync(cancellationToken);
        var seen = items.Select(item => item.Id).ToHashSet();
        foreach (var chunk in ids.Chunk(500))
            items.AddRange((await BudgetCandidates(eligible.Where(draft => chunk.Contains(draft.Id)), userId, isPersonalAccount)
                .ToListAsync(cancellationToken)).Where(item => seen.Add(item.Id)));
        var unchanged = await eligible.CountAsync(cancellationToken) - items.Count;
        return new ImportBudgetChoicePreview(items, skipped, unchanged, default);
    }

    private static IQueryable<ImportBudgetChoiceCandidate> BudgetCandidates(
        IQueryable<ImportTransactionDraft> query, Guid userId, bool isPersonalAccount) =>
        query.OrderBy(draft => draft.SourceRowNumber).ThenBy(draft => draft.Id).Select(draft =>
            new ImportBudgetChoiceCandidate(draft.Id, draft.TransactionDate, draft.Amount, draft.Description,
                draft.SelectedCategoryId, draft.IncludeInHouseholdBudget ?? !isPersonalAccount,
                draft.IncludeInHouseholdBudget.HasValue ? draft.PersonalBudgetUserId == userId : isPersonalAccount));

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
