using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Households;

namespace BudgetApp.Tests.Application.Imports;

public sealed class ImportDraftReadServiceTests
{
    [Fact]
    public async Task SummaryAndPageNeverUseTheFullDraftReadOrPerformWrites()
    {
        var fixture = new ImportReviewFixture(250);
        var summary = await fixture.Service.GetReviewSummaryAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, CancellationToken.None);
        Assert.Equal(250, summary.Counts.TotalRows);
        var page = await fixture.Service.GetDraftPageAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, ImportDraftFilter.All, 2, CancellationToken.None);
        Assert.Equal(100, page.Items.Count);
        Assert.Equal(250, page.TotalCount);
        Assert.Equal(3, page.TotalPages);
        Assert.Equal(2, fixture.CountReads);
        Assert.Equal(1, fixture.DraftPageReads);
        Assert.Equal(0, fixture.FullDraftReads);
        Assert.Equal(0, fixture.Saves);
        Assert.Equal(0, fixture.TransactionAdds);
    }

    [Fact]
    public async Task SummaryDoesNotParseRawLabelsAndPageDoesNotParseRowsOutsideIt()
    {
        var fixture = new ImportReviewFixture();
        fixture.Drafts = Enumerable.Range(0, 101).Select(i => i == 100
            ? BudgetApp.Domain.Imports.ImportTransactionDraft.Create(fixture.File.Id, i + 2, "[]", ImportReviewFixture.Date, 1m, "Synthetic", null, ImportReviewFixture.Now)
            : fixture.CreateDraft(i + 2, ImportReviewFixture.Date, 1m, "Synthetic")).ToArray();
        // A non-object legacy raw payload cannot be enumerated for labels. The
        // summary and first page must not touch the off-page raw payload at all.
        var summary = await fixture.Service.GetReviewSummaryAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, CancellationToken.None);
        Assert.Equal(101, summary.Counts.TotalRows);
        var page = await fixture.Service.GetDraftPageAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, ImportDraftFilter.All, 1, CancellationToken.None);
        Assert.Equal(100, page.Items.Count);
        Assert.Equal(0, fixture.FullDraftReads);
    }

    [Theory]
    [InlineData(0, ImportDraftFilter.All)]
    [InlineData(-1, ImportDraftFilter.All)]
    [InlineData(1, (ImportDraftFilter)999)]
    public async Task InvalidReadParametersDoNotLoadAnyRows(int page, ImportDraftFilter filter)
    {
        var fixture = new ImportReviewFixture();
        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Service.GetDraftPageAsync(
            fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, filter, page, CancellationToken.None));
        Assert.Equal(0, fixture.CountReads);
        Assert.Equal(0, fixture.DraftPageReads);
    }

    [Fact]
    public async Task UnauthorizedAndCanceledReadsDoNotLoadRowsOrCounts()
    {
        var fixture = new ImportReviewFixture(1) { Role = null };
        await Assert.ThrowsAsync<HouseholdAccessDeniedException>(() => fixture.Service.GetReviewSummaryAsync(
            fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, CancellationToken.None));
        fixture.Role = HouseholdRole.Owner;
        fixture.IsPersonalAccount = true;
        fixture.AccountOwnerUserId = Guid.NewGuid();
        await Assert.ThrowsAsync<ImportNotFoundException>(() => fixture.Service.GetDraftPageAsync(
            fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, ImportDraftFilter.All, 1, CancellationToken.None));
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => fixture.Service.GetDraftPageAsync(
            fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, ImportDraftFilter.All, 1, cancellation.Token));
        Assert.Equal(0, fixture.CountReads);
        Assert.Equal(0, fixture.DraftPageReads);
        Assert.Equal(0, fixture.FullDraftReads);
    }
}
