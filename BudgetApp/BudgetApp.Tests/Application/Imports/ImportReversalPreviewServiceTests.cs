using System.Security.Claims;
using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using BudgetApp.Server.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace BudgetApp.Tests.Application.Imports;

public sealed class ImportReversalPreviewServiceTests
{
    [Fact]
    public async Task DiagnosticLogIdentifiesTheReadWithoutFinancialValuesOrAnAuditWrite()
    {
        var fixture = new ImportReviewFixture(1);
        await fixture.Service.CompleteAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, default);
        var repository = new PreviewRepository(Snapshot(fixture));
        var log = new CaptureLogger();
        var controller = Controller(fixture, repository, log);
        var saves = fixture.Saves;
        var result = await controller.ReversalPreview(fixture.File.HouseholdId, fixture.File.Id, default);
        Assert.IsType<OkObjectResult>(result.Result);
        var entry = Assert.Single(log.Entries);
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains("No transactions changed", entry.Text);
        Assert.Contains("EligibleRows", entry.Keys);
        Assert.All(entry.Keys, key => Assert.Contains(key, new[] {
            "UserId", "ImportFileId", "HouseholdId", "EligibleRows", "BlockedRows", "{OriginalFormat}" }));
        Assert.DoesNotContain(fixture.File.OriginalFileName, entry.Text);
        Assert.DoesNotContain(fixture.Transactions[0].Description, entry.Text);
        Assert.Equal(saves, fixture.Saves);
    }

    [Fact]
    public async Task RejectedAccessIsLoggedWithoutLoadingPrivateRows()
    {
        var fixture = new ImportReviewFixture(1) { Role = null };
        var repository = new PreviewRepository(new([], []));
        var log = new CaptureLogger();
        var result = await Controller(fixture, repository, log).ReversalPreview(fixture.File.HouseholdId, fixture.File.Id, default);
        Assert.Equal(403, Assert.IsType<ObjectResult>(result.Result).StatusCode);
        Assert.Equal(LogLevel.Warning, Assert.Single(log.Entries).Level);
        Assert.Equal(0, repository.Reads);
        Assert.Equal(0, fixture.Saves);
    }

    [Fact]
    public async Task OversizeHistoryFailsClosedAndCancellationDoesNotWrite()
    {
        var fixture = new ImportReviewFixture(1);
        await fixture.Service.CompleteAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, default);
        var snapshot = Snapshot(fixture);
        var repo = new PreviewRepository(snapshot with {
            Drafts = Enumerable.Repeat(snapshot.Drafts[0], TransactionImportLimits.MaxRows + 1).ToList() });
        var service = Service(fixture, repo);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, 1, default));
        using var canceled = new CancellationTokenSource(); canceled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.GetAsync(fixture.File.HouseholdId, fixture.UserId, fixture.File.Id, 1, canceled.Token));
        Assert.Equal(1, fixture.Saves); // Only initial completion wrote anything.
    }

    private static ImportReversalPreviewService Service(ImportReviewFixture fixture, PreviewRepository repository) =>
        new(fixture, repository, new HouseholdAuthorizationService(fixture), TimeProvider.System);

    private static ImportsController Controller(ImportReviewFixture fixture, PreviewRepository repository, CaptureLogger logger) =>
        new(null!, fixture.Service, Service(fixture, repository), logger) {
            ControllerContext = new() { HttpContext = new DefaultHttpContext {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, fixture.UserId.ToString())], "test"))
            } }
        };

    private static ImportReversalSnapshot Snapshot(ImportReviewFixture fixture) => new(
        fixture.Drafts.Select(d => new ImportReversalDraftRecord(d.Id, d.SourceRowNumber, d.ReviewDecision,
            d.ApprovedTransactionId, d.TransactionDate, d.Amount, d.Description, d.OriginalDescription,
            d.SelectedCategoryId, d.IncludeInHouseholdBudget, d.PersonalBudgetUserId, d.UpdatedAtUtc)).ToList(),
        fixture.Transactions.Select(t => new ImportReversalTransactionRecord(t, false, false)).ToList());

    private sealed class PreviewRepository(ImportReversalSnapshot snapshot) : IImportReversalRepository
    {
        public int Reads { get; private set; }
        public Task<ImportReversalSnapshot> GetSnapshotAsync(Guid id, int maxRows, CancellationToken ct, bool forUpdate = false)
        { ct.ThrowIfCancellationRequested(); Reads++; return Task.FromResult(snapshot); }
        public Task<T> ExecuteAtomicAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken ct) => action(ct);
    }

    private sealed class CaptureLogger : ILogger<ImportsController>
    {
        public List<(LogLevel Level, string Text, string[] Keys)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> format) =>
            Entries.Add((level, format(state, exception),
                ((IEnumerable<KeyValuePair<string, object?>>)state!).Select(pair => pair.Key).ToArray()));
    }
}
