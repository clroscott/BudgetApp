using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;

namespace BudgetApp.Tests.Application.Imports;

public sealed class ImportReviewServiceTests
{
    public static TheoryData<DateOnly?, decimal?, string?, DateOnly, decimal, string> MatchingCases => new()
    {
        { ImportReviewFixture.Date, -25m, "  SHOP  ", ImportReviewFixture.Date, -25m, "shop" },
        { ImportReviewFixture.Date, -25m, "\tShop\u00a0", ImportReviewFixture.Date, -25m, "  SHOP\t" },
        { ImportReviewFixture.Date, -1.2345m, "Refund", ImportReviewFixture.Date, -1.2345m, "REFUND" },
        { ImportReviewFixture.Date, 1.2300m, "Income", ImportReviewFixture.Date, 1.23m, "income" },
        { ImportReviewFixture.Date, -1.2345m, "Shop", ImportReviewFixture.Date, -1.2346m, "Shop" },
        { ImportReviewFixture.Date, -25m, "Shop", ImportReviewFixture.Date.AddDays(1), -25m, "Shop" },
        { ImportReviewFixture.Date, -25m, "Shop", ImportReviewFixture.Date, 25m, "Shop" },
        { ImportReviewFixture.Date, -25m, "A  B", ImportReviewFixture.Date, -25m, "A B" },
        { ImportReviewFixture.Date, -25m, "i", ImportReviewFixture.Date, -25m, "\u0130" },
        { ImportReviewFixture.Date, -25m, "\u00e9", ImportReviewFixture.Date, -25m, "e\u0301" },
        { null, -25m, "Shop", ImportReviewFixture.Date, -25m, "Shop" },
        { ImportReviewFixture.Date, null, "Shop", ImportReviewFixture.Date, -25m, "Shop" },
        { ImportReviewFixture.Date, -25m, null, ImportReviewFixture.Date, -25m, "Shop" },
        { ImportReviewFixture.Date, -25m, "   ", ImportReviewFixture.Date, -25m, "Shop" }
    };

    [Theory]
    [MemberData(nameof(MatchingCases))]
    public async Task DuplicateLookup_MatchesOriginalComparison(DateOnly? date, decimal? amount,
        string? description, DateOnly candidateDate, decimal candidateAmount, string candidateDescription)
    {
        var fixture = new ImportReviewFixture();
        var draft = fixture.CreateDraft(2, date, amount, description);
        fixture.Candidates = [new(Guid.NewGuid(), candidateDate, candidateAmount, candidateDescription)];
        var expected = OriginalMatch(draft, fixture.Candidates);

        await fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, [draft], CancellationToken.None);

        Assert.Equal(expected?.TransactionId, draft.PossibleMatchingTransactionId);
        Assert.Equal(expected is null ? ImportDraftDuplicateStatus.NoMatch : ImportDraftDuplicateStatus.PossibleDuplicate,
            draft.DuplicateStatus);
        Assert.Equal(date.HasValue ? 1 : 0, fixture.CandidateReads);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task DuplicateLookup_PreservesFirstSuppliedMatch(int position)
    {
        var fixture = new ImportReviewFixture();
        var draft = fixture.CreateDraft(2, ImportReviewFixture.Date, -25m, "SHOP");
        var candidates = Enumerable.Range(0, 3)
            .Select(i => new DuplicateCandidate(Guid.NewGuid(), ImportReviewFixture.Date, -25m, $"Other {i}"))
            .ToList();
        var first = new DuplicateCandidate(Guid.NewGuid(), ImportReviewFixture.Date, -25m, " Shop ");
        candidates.Insert(position, first);
        candidates.Add(new(Guid.NewGuid(), ImportReviewFixture.Date, -25m, "shop"));
        fixture.Candidates = candidates;

        await fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, [draft], CancellationToken.None);

        Assert.Equal(first.TransactionId, draft.PossibleMatchingTransactionId);
    }

    [Fact]
    public async Task DuplicateLookup_UsesOneReadAndPreservesMixedDraftResults()
    {
        var fixture = new ImportReviewFixture();
        fixture.Drafts = Enumerable.Range(0, 500).Select(i => fixture.CreateDraft(i + 2,
            i % 11 == 0 ? null : ImportReviewFixture.Date.AddDays(i % 7),
            i % 13 == 0 ? null : i / 10m + 0.0001m,
            i % 17 == 0 ? null : $"  SHOP {i % 19}  ",
            i % 23 == 0 ? "Unrelated parser error" : null)).ToArray();
        fixture.Candidates = Enumerable.Range(0, 500).Select(i => new DuplicateCandidate(Guid.NewGuid(),
            ImportReviewFixture.Date.AddDays(i % 7), i / 10m + 0.0001m, $"shop {i % 19}")).ToArray();
        var expected = fixture.Drafts.Select(draft => OriginalMatch(draft, fixture.Candidates)?.TransactionId).ToArray();

        await fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, fixture.Drafts, CancellationToken.None);

        Assert.Equal(expected, fixture.Drafts.Select(draft => draft.PossibleMatchingTransactionId));
        Assert.Equal(1, fixture.CandidateReads);
        Assert.Equal((ImportReviewFixture.Date, ImportReviewFixture.Date.AddDays(6)), fixture.CandidateRange);
        Assert.All(fixture.Drafts, draft => Assert.Equal(ImportReviewFixture.Now, draft.UpdatedAtUtc));
    }

    [Fact]
    public async Task DuplicateLookup_NoDatesOrEmptyDraftsDoesNotReadCandidates()
    {
        var fixture = new ImportReviewFixture();
        var draft = fixture.CreateDraft(2, null, -25m, "Shop");
        draft.SetDuplicateResult(ImportDraftDuplicateStatus.PossibleDuplicate, Guid.NewGuid(), ImportReviewFixture.Now);

        await fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, [draft], CancellationToken.None);
        await fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, [], CancellationToken.None);

        Assert.Equal(0, fixture.CandidateReads);
        Assert.Equal(ImportDraftDuplicateStatus.NoMatch, draft.DuplicateStatus);
        Assert.Null(draft.PossibleMatchingTransactionId);
    }

    [Fact]
    public async Task DuplicateLookup_RecheckingResetsAcknowledgmentAndDecision()
    {
        var fixture = new ImportReviewFixture();
        var draft = fixture.CreateDraft(2, ImportReviewFixture.Date, -25m, "Shop");
        draft.SetDuplicateResult(ImportDraftDuplicateStatus.PossibleDuplicate, Guid.NewGuid(), ImportReviewFixture.Now);
        draft.Approve(fixture.UserId, true, ImportReviewFixture.Now);

        await fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, [draft], CancellationToken.None);

        Assert.Equal(ImportDraftDuplicateStatus.NoMatch, draft.DuplicateStatus);
        Assert.Equal(ImportDraftReviewDecision.Pending, draft.ReviewDecision);
        Assert.False(draft.IsDuplicateAcknowledged);
    }

    [Theory]
    [InlineData(100)]
    [InlineData(1000)]
    public async Task DuplicateLookup_EnumeratesCandidatesOnceRatherThanPerDraft(int rows)
    {
        var fixture = new ImportReviewFixture();
        var candidates = new CountingList<DuplicateCandidate>(Enumerable.Range(0, rows)
            .Select(i => new DuplicateCandidate(Guid.NewGuid(), ImportReviewFixture.Date, 100m, $"Existing {i}"))
            .ToArray());
        fixture.Candidates = candidates;
        fixture.Drafts = Enumerable.Range(0, rows)
            .Select(i => fixture.CreateDraft(i + 2, ImportReviewFixture.Date, 100m, $"New {i}")).ToArray();

        await fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, fixture.Drafts, CancellationToken.None);

        Assert.Equal(rows, candidates.Visited);
        Assert.All(fixture.Drafts, draft => Assert.Equal(ImportDraftDuplicateStatus.NoMatch, draft.DuplicateStatus));
    }

    [Theory]
    [InlineData(100)]
    [InlineData(1000)]
    public async Task Completion_DraftVisitsAreBoundedByLinearPasses(int rows)
    {
        var fixture = new ImportReviewFixture(rows);
        var drafts = new CountingList<ImportTransactionDraft>(fixture.Drafts);
        fixture.Drafts = drafts;

        var result = await fixture.Service.CompleteAsync(fixture.File.HouseholdId, fixture.UserId,
            fixture.File.Id, CancellationToken.None);

        Assert.Equal(rows, result.CreatedTransactionCount);
        // Allows a few statistics/validation passes, but catches per-transaction Single scans.
        Assert.InRange(drafts.Visited, rows, 10 * rows);
        Assert.Equal(rows, fixture.Transactions.Count);
    }

    [Fact]
    public async Task DuplicateLookup_CanceledReadDoesNotChangeDraft()
    {
        var fixture = new ImportReviewFixture();
        var draft = fixture.CreateDraft(2, ImportReviewFixture.Date, -25m, "Shop");
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, [draft], cancellation.Token));

        Assert.Equal(ImportDraftDuplicateStatus.NotChecked, draft.DuplicateStatus);
    }

    [Fact]
    public async Task Completion_LinksCorrectDraftsAndPreservesInclusionAndRetry()
    {
        var fixture = new ImportReviewFixture(4);
        // A removed source row and different draft order must not affect provenance.
        var last = fixture.CreateDraft(90, ImportReviewFixture.Date, -1.2345m, "Last purchase");
        last.SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, ImportReviewFixture.Now);
        last.Approve(fixture.UserId, false, ImportReviewFixture.Now);
        fixture.Drafts = [last, fixture.Drafts[2], fixture.Drafts[0], fixture.Drafts[1]];
        fixture.Drafts[1].Exclude(fixture.UserId, ImportReviewFixture.Now);
        last.SetBudgetInclusion(true, fixture.UserId, ImportReviewFixture.Now);

        var result = await fixture.Service.CompleteAsync(fixture.File.HouseholdId, fixture.UserId,
            fixture.File.Id, CancellationToken.None);
        var retry = await fixture.Service.CompleteAsync(fixture.File.HouseholdId, fixture.UserId,
            fixture.File.Id, CancellationToken.None);

        Assert.Equal(3, result.CreatedTransactionCount);
        Assert.Equal(0, retry.CreatedTransactionCount);
        Assert.Equal(1, fixture.TransactionAdds);
        Assert.Equal(1, fixture.Saves);
        Assert.Equal(ImportFileStatus.Completed, fixture.File.Status);
        var byRow = fixture.Transactions.ToDictionary(transaction => transaction.ImportRowNumber!.Value);
        foreach (var draft in fixture.Drafts.Where(draft => draft.ReviewDecision == ImportDraftReviewDecision.Approved))
        {
            var transaction = byRow[draft.SourceRowNumber];
            Assert.Equal(transaction.Id, draft.ApprovedTransactionId);
            Assert.Equal(draft.Amount, transaction.Amount);
            Assert.Equal(draft.Description, transaction.Description);
            Assert.Equal(fixture.File.Id, transaction.ImportFileId);
            Assert.Equal(TransactionReviewStatus.Reviewed, transaction.ReviewStatus);
        }
        Assert.Null(fixture.Drafts[1].ApprovedTransactionId);
        Assert.True(byRow[90].IncludeInHouseholdBudget);
        Assert.Contains(byRow[90].PersonalBudgetInclusions, inclusion => inclusion.UserId == fixture.UserId);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Completion_ViewerCanOnlyCompleteOwnPersonalAccount(bool personal)
    {
        var fixture = new ImportReviewFixture(1)
        {
            Role = HouseholdRole.Viewer,
            IsPersonalAccount = personal
        };
        fixture.AccountOwnerUserId = personal ? fixture.UserId : null;
        if (personal)
        {
            var result = await fixture.Service.CompleteAsync(fixture.File.HouseholdId, fixture.UserId,
                fixture.File.Id, CancellationToken.None);
            Assert.Equal(1, result.CreatedTransactionCount);
            Assert.False(fixture.Transactions[0].IncludeInHouseholdBudget);
        }
        else
        {
            await Assert.ThrowsAsync<HouseholdAccessDeniedException>(() => fixture.Service.CompleteAsync(
                fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, CancellationToken.None));
            Assert.Equal(0, fixture.Saves);
            Assert.Null(fixture.Drafts[0].ApprovedTransactionId);
        }
    }

    private static DuplicateCandidate? OriginalMatch(ImportTransactionDraft draft,
        IReadOnlyList<DuplicateCandidate> candidates) => candidates.FirstOrDefault(candidate =>
        draft.TransactionDate == candidate.TransactionDate && draft.Amount == candidate.Amount &&
        string.Equals(draft.Description?.Trim(), candidate.Description.Trim(), StringComparison.OrdinalIgnoreCase));

    private sealed class CountingList<T>(IReadOnlyList<T> items) : IReadOnlyList<T>
    {
        internal int Visited { get; private set; }
        public int Count => items.Count;
        public T this[int index] => items[index];
        public IEnumerator<T> GetEnumerator()
        {
            foreach (var item in items)
            {
                Visited++;
                yield return item;
            }
        }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
