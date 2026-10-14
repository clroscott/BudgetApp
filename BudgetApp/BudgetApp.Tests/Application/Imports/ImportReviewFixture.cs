using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;

namespace BudgetApp.Tests.Application.Imports;

// In-memory service fixture, also used by the opt-in CPU benchmark. No SQL or email.
internal sealed class ImportReviewFixture : IImportRepository, IHouseholdAuthorizationRepository
{
    internal static readonly DateTimeOffset Now = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);
    internal static readonly DateOnly Date = new(2026, 10, 1);
    internal Guid UserId { get; } = Guid.NewGuid();
    internal ImportFile File { get; }
    internal ImportReviewService Service { get; }
    internal IReadOnlyList<ImportTransactionDraft> Drafts { get; set; } = [];
    internal IReadOnlyList<DuplicateCandidate> Candidates { get; set; } = [];
    internal IReadOnlyList<Transaction> Transactions { get; private set; } = [];
    internal HouseholdRole? Role { get; set; } = HouseholdRole.Editor;
    internal bool IsPersonalAccount { get; set; }
    internal Guid? AccountOwnerUserId { get; set; }
    internal int CandidateReads { get; private set; }
    internal int TransactionAdds { get; private set; }
    internal int Saves { get; private set; }
    internal int FullDraftReads { get; private set; }
    internal int DraftPageReads { get; private set; }
    internal int CountReads { get; private set; }
    internal List<Guid> TargetedDraftReads { get; } = [];
    internal (DateOnly From, DateOnly To)? CandidateRange { get; private set; }

    internal ImportReviewFixture(int approvedRows = 0)
    {
        File = ImportFile.Create(Guid.NewGuid(), Guid.NewGuid(), UserId, "synthetic.csv", 100,
            new string('A', 64), Now);
        Service = new ImportReviewService(this, null!, null!,
            new HouseholdAuthorizationService(this), new FixedTimeProvider());
        if (approvedRows == 0) return;

        Drafts = Enumerable.Range(0, approvedRows).Select(i =>
        {
            var draft = CreateDraft(i + 2, Date, -(i + 1m), $"Purchase {i}");
            draft.SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, Now);
            draft.Approve(UserId, false, Now);
            return draft;
        }).ToArray();
        File.StartProcessing(Now);
        File.MarkReadyForReview(new ImportStatistics(approvedRows, approvedRows, 0, approvedRows, 0, 0), Now);
    }

    internal ImportTransactionDraft CreateDraft(int row, DateOnly? date, decimal? amount,
        string? description, string? validationMessage = null) =>
        ImportTransactionDraft.Create(File.Id, row, "{}", date, amount, description, validationMessage, Now);

    public Task<HouseholdRole?> GetActiveRoleAsync(Guid householdId, Guid userId, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(householdId == File.HouseholdId && userId == UserId ? Role : null);
    }

    public Task<ImportAccessRecord?> GetAccessAsync(Guid householdId, Guid importId, bool update, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(householdId == File.HouseholdId && importId == File.Id
            ? new ImportAccessRecord(File, "Synthetic account", "CAD", IsPersonalAccount, AccountOwnerUserId)
            : null);
    }

    public Task<IReadOnlyList<ImportTransactionDraft>> ListDraftsAsync(Guid importId, bool update, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        FullDraftReads++;
        return Task.FromResult(Drafts);
    }

    public Task<IReadOnlyList<ImportTransactionDraft>> GetDraftsForUpdateAsync(Guid importId, IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        TargetedDraftReads.AddRange(ids);
        return Task.FromResult<IReadOnlyList<ImportTransactionDraft>>(Drafts.Where(draft => ids.Contains(draft.Id) && draft.ImportFileId == importId).ToArray());
    }

    public Task<ImportDraftCounts> GetDraftCountsAsync(Guid importId, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        CountReads++;
        return Task.FromResult(new ImportDraftCounts(Drafts.Count,
            Drafts.Count(draft => draft.ValidationStatus == ImportDraftValidationStatus.Valid),
            Drafts.Count(draft => draft.ValidationStatus == ImportDraftValidationStatus.Invalid),
            Drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Approved),
            Drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Excluded),
            Drafts.Count(draft => draft.DuplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate),
            Drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Pending),
            Drafts.Count(draft => draft.DuplicateStatus == ImportDraftDuplicateStatus.NotChecked),
            Drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Pending && draft.ValidationStatus == ImportDraftValidationStatus.Valid)));
    }

    public Task<ImportDraftPageQueryResult> ListDraftPageAsync(Guid importId, Guid householdId, ImportDraftFilter filter,
        int page, int pageSize, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (filter != ImportDraftFilter.All) throw new NotSupportedException("Filter parity uses the real repository integration tests.");
        DraftPageReads++;
        var actualPage = Math.Min(page, Math.Max(1, (int)Math.Ceiling((double)Drafts.Count / pageSize)));
        return Task.FromResult(new ImportDraftPageQueryResult(Drafts.OrderBy(draft => draft.SourceRowNumber).ThenBy(draft => draft.Id)
            .Skip((actualPage - 1) * pageSize).Take(pageSize).Select(ImportDraftReadRecord.FromDraft).ToList(), actualPage, Drafts.Count));
    }

    public Task<IReadOnlyList<DuplicateCandidate>> ListDuplicateCandidatesAsync(Guid accountId,
        DateOnly from, DateOnly to, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (accountId != File.AccountId) throw new InvalidOperationException("Unexpected account.");
        CandidateReads++;
        CandidateRange = (from, to);
        return Task.FromResult(Candidates);
    }

    public Task AddTransactionsAsync(IReadOnlyCollection<Transaction> transactions, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        TransactionAdds++;
        Transactions = transactions.ToArray();
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        Saves++;
        return Task.CompletedTask;
    }

    public Task<ImportListQueryResult> ListVisibleAsync(Guid householdId, Guid userId, ImportListFilter filter,
        int page, int pageSize, CancellationToken ct) => throw new NotSupportedException();
    public Task<ImportSummary> GetSummaryAsync(Guid householdId, Guid userId, CancellationToken ct) => throw new NotSupportedException();
    public Task<bool> ExistsByAccountAndHashAsync(Guid accountId, string hash, CancellationToken ct, string? sourceWorksheetId = null) => throw new NotSupportedException();
    public Task AddAsync(ImportFile file, IReadOnlyCollection<ImportTransactionDraft> drafts, CancellationToken ct) => throw new NotSupportedException();
    public void Remove(ImportFile file) => throw new NotSupportedException();
    public void RemoveDraft(ImportTransactionDraft draft) => Drafts = Drafts.Where(item => item.Id != draft.Id).ToArray();

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
