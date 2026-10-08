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
        return Task.FromResult(Drafts);
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

    public Task<IReadOnlyList<ImportListRecord>> ListVisibleAsync(Guid householdId, Guid userId, CancellationToken ct) => throw new NotSupportedException();
    public Task<bool> ExistsByAccountAndHashAsync(Guid accountId, string hash, CancellationToken ct) => throw new NotSupportedException();
    public Task AddAsync(ImportFile file, IReadOnlyCollection<ImportTransactionDraft> drafts, CancellationToken ct) => throw new NotSupportedException();
    public void Remove(ImportFile file) => throw new NotSupportedException();
    public void RemoveDraft(ImportTransactionDraft draft) => throw new NotSupportedException();

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
