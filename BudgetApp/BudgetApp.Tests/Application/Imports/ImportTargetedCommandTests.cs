using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;

namespace BudgetApp.Tests.Application.Imports;

public sealed class ImportTargetedCommandTests
{
    [Fact]
    public async Task CorrectionLoadsOnlyChangedRowAndReturnsExactGlobalCounts()
    {
        var fixture = new ImportReviewFixture(1000);
        var target = fixture.Drafts[900];
        var result = await fixture.Service.UpdateDraftAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id,
            target.Id, target.TransactionDate, -1.2345m, "Corrected", null, CancellationToken.None);
        Assert.Equal([target.Id], fixture.TargetedDraftReads);
        Assert.Equal(0, fixture.FullDraftReads);
        Assert.Equal(1, fixture.CountReads);
        Assert.Equal(1, result.SavedRows);
        Assert.Equal(-1.2345m, Assert.Single(result.Items).Amount);
        Assert.Equal(1000, result.Summary.Counts.TotalRows);
        Assert.Equal(999, result.Summary.Counts.ApprovedRows);
        Assert.Equal(1, result.Summary.Counts.PendingRows);
        Assert.Equal(999, fixture.File.ApprovedRowCount);
        Assert.Equal(1, fixture.Saves);
        Assert.Equal(0, fixture.TransactionAdds);
    }

    [Fact]
    public async Task BulkCorrectionsAndDecisionsUseOnlyRequestedRowsAndAdvanceFixedClockTokens()
    {
        var fixture = new ImportReviewFixture(1000);
        var first = fixture.Drafts[0];
        var last = fixture.Drafts[^1];
        var result = await fixture.Service.BulkUpdateDraftsWithResultAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id,
            [new(first.Id, first.TransactionDate, 5m, "First correction", null),
             new(last.Id, last.TransactionDate, 0m, "Invalid correction", null)], CancellationToken.None);
        Assert.Equal(2, result.Items.Count);
        Assert.Equal(998, result.Summary.Counts.ApprovedRows);
        Assert.Equal(999, result.Summary.Counts.ValidRows);
        Assert.Equal(1, result.Summary.Counts.InvalidRows);
        Assert.True(result.Summary.UpdatedAtUtc > ImportReviewFixture.Now);
        var previousVersion = result.Summary.UpdatedAtUtc;
        var reviewed = await fixture.Service.SetDecisionAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id,
            first.Id, "Approved", false, CancellationToken.None, previousVersion);
        Assert.Equal(999, reviewed.Summary.Counts.ApprovedRows);
        Assert.Equal(1, reviewed.Summary.Counts.PendingRows);
        Assert.True(reviewed.Summary.UpdatedAtUtc > previousVersion);
        Assert.Equal(new[] { first.Id, last.Id, first.Id }, fixture.TargetedDraftReads);
        Assert.Equal(0, fixture.FullDraftReads);
    }

    [Fact]
    public async Task StaleVersionRejectsBeforeRowLoadingOrSaving()
    {
        var fixture = new ImportReviewFixture(2);
        await Assert.ThrowsAsync<ImportReviewConflictException>(() => fixture.Service.SetDecisionAsync(
            fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, fixture.Drafts[0].Id,
            "Excluded", false, CancellationToken.None, ImportReviewFixture.Now.AddTicks(-1)));
        Assert.Empty(fixture.TargetedDraftReads);
        Assert.Equal(0, fixture.CountReads);
        Assert.Equal(0, fixture.Saves);
    }

    [Fact]
    public async Task RemovalReturnsOnlyRemovedIdAndCannotRemoveFinalRow()
    {
        var fixture = new ImportReviewFixture(2);
        var id = fixture.Drafts[0].Id;
        var result = await fixture.Service.RemoveDraftAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, id, CancellationToken.None);
        Assert.Empty(result.Items);
        Assert.Equal([id], result.RemovedDraftIds);
        Assert.Equal(1, result.Summary.Counts.TotalRows);
        Assert.Equal(1, result.Summary.Counts.ApprovedRows);
        Assert.Equal(0, fixture.FullDraftReads);
        await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Service.RemoveDraftAsync(fixture.File.HouseholdId,
            fixture.UserId, fixture.File.Id, fixture.Drafts[0].Id, CancellationToken.None));
        Assert.Equal(1, fixture.Saves);
    }
}
