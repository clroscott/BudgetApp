using System.Net;
using System.Net.Http.Json;
using System.Text;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Imports;
using BudgetApp.Application.Transactions;
using BudgetApp.Application.Dashboards;
using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class ImportReversalPreviewTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 15, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CorrectedReimportCreatesNewStagedBatchAndStillRequiresSameFileAllowance(bool excel)
    {
        using var client = factory.CreateAuthenticatedTestClient(); var seed = await Seed(client);
        var filename = excel ? "correction.xlsx" : "correction.csv";
        var bytes = excel ? Infrastructure.Imports.XlsxTestWorkbook.Create(new Infrastructure.Imports.XlsxTestWorkbook.Sheet("Transactions",
            Infrastructure.Imports.XlsxTestWorkbook.StandardRows("Correction test", "23.4567")))
            : Encoding.UTF8.GetBytes("Date,Description,Amount\n2026-07-20,Correction test,23.4567\n");
        Guid original;
        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<TransactionImportService>();
            using var stream = new MemoryStream(bytes);
            var upload = await service.UploadAsync(seed.HouseholdId, seed.UserId, seed.AccountId, filename, stream, false, null, default);
            original = upload.ImportFileId;
            var review = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
            await review.BulkSetDecisionAsync(seed.HouseholdId, seed.UserId, original, "Approved", default);
            await review.CompleteAsync(seed.HouseholdId, seed.UserId, original, default);
        }
        var completed = seed with { ImportId = original }; var preview = await Preview(client, completed);
        Assert.True(preview.CanReverse);
        Assert.Equal(HttpStatusCode.OK, (await Reverse(client, completed, preview.PreviewVersion)).StatusCode);
        using var check = factory.Services.CreateScope();
        var importer = check.ServiceProvider.GetRequiredService<TransactionImportService>();
        using var deniedStream = new MemoryStream(bytes);
        await Assert.ThrowsAsync<DuplicateImportFileException>(() => importer.UploadAsync(seed.HouseholdId, seed.UserId, seed.AccountId,
            filename, deniedStream, false, null, default));
        using var allowedStream = new MemoryStream(bytes);
        var next = await importer.UploadAsync(seed.HouseholdId, seed.UserId, seed.AccountId, filename, allowedStream, true, null, default);
        Assert.NotEqual(original, next.ImportFileId);
        var db = check.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.False(await db.Transactions.AnyAsync(t => t.ImportFileId == next.ImportFileId));
        var draft = await db.ImportTransactionDrafts.SingleAsync(d => d.ImportFileId == next.ImportFileId);
        Assert.Equal(ImportDraftReviewDecision.Pending, draft.ReviewDecision);
        Assert.NotEqual(ImportDraftDuplicateStatus.PossibleDuplicate, draft.DuplicateStatus);
        Assert.Null(draft.ApprovedTransactionId);
        Assert.Equal(ImportFileStatus.Reversed, (await db.ImportFiles.AsNoTracking().SingleAsync(f => f.Id == original)).Status);
    }

    [Fact]
    public async Task UndoLeavesOtherTransactionsAloneAndReconcilesListExportAndDashboard()
    {
        using var client = factory.CreateAuthenticatedTestClient(); var seed = await Seed(client);
        Guid manualId, otherImport;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var manual = Transaction.CreateManual(seed.HouseholdId, seed.AccountId, null, new(2026, 10, 1),
                null, 7.1234m, "Manual stays", null, null, false, seed.UserId, Now);
            db.Transactions.Add(manual); await db.SaveChangesAsync(); manualId = manual.Id;
            otherImport = (await AddCompleted(scope.ServiceProvider, seed.UserId, seed.HouseholdId, seed.AccountId, 1, "other.csv")).ImportId;
        }
        var preview = await Preview(client, seed);
        using (var beforeScope = factory.Services.CreateScope())
        {
            var actuals = await beforeScope.ServiceProvider.GetRequiredService<IBudgetRepository>()
                .GetActualsAsync(seed.HouseholdId, seed.UserId, 2026, 10, BudgetScope.Household, "CAD", default);
            Assert.Equal(14.7777m, actuals.UncategorizedAmount);
        }
        Assert.Equal(HttpStatusCode.OK, (await Reverse(client, seed, preview.PreviewVersion)).StatusCode);
        using var check = factory.Services.CreateScope(); var database = check.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.False((await database.Transactions.SingleAsync(t => t.Id == manualId)).IsVoided);
        Assert.False((await database.Transactions.SingleAsync(t => t.ImportFileId == otherImport)).IsVoided);
        var repository = check.ServiceProvider.GetRequiredService<ITransactionRepository>();
        var listed = await repository.ListVisibleAsync(seed.HouseholdId, seed.UserId, null, null, null, null, null, false, null, 0, 100, default);
        Assert.Equal(2, listed.TotalCount); Assert.Equal(4.7778m, listed.TotalsByCurrency["CAD"]);
        var exported = await repository.ListVisibleForExportAsync(seed.HouseholdId, seed.UserId,
            new(null, null, null, null, null, false, null), default);
        Assert.Equal(2, exported.Count); Assert.Equal(4.7778m, exported.Sum(t => t.Amount));
        var budgets = check.ServiceProvider.GetRequiredService<IBudgetRepository>();
        Assert.Equal(4.7778m, (await budgets.GetActualsAsync(seed.HouseholdId, seed.UserId, 2026, 10,
            BudgetScope.Household, "CAD", default)).UncategorizedAmount);
        var annual = await budgets.GetAnnualActualsAsync(seed.HouseholdId, seed.UserId, 2026, BudgetScope.Household, "CAD", default);
        Assert.Equal(7.1234m, annual.CategoryMonths.Sum(m => m.SpendingAmount));
        Assert.Equal(2.3456m, annual.CategoryMonths.Sum(m => m.IncomeAmount));
        var dashboard = await check.ServiceProvider.GetRequiredService<IDashboardSummaryRepository>()
            .GetActivityAsync(seed.HouseholdId, seed.UserId, 2026, 10, "Household", "CAD", true, default);
        Assert.Equal(1, dashboard.UncategorizedSpendingCount);
        Assert.Equal(2, dashboard.Recent!.Count); Assert.DoesNotContain(dashboard.Recent, t => preview.Items.Any(r => r.TransactionId == t.Id));
    }

    [Fact]
    public async Task UndoRequiresCsrfAndRechecksPermissionsAfterPreviewAndOnIdempotentRetry()
    {
        using var client = factory.CreateAuthenticatedTestClient(); var seed = await Seed(client);
        var preview = await Preview(client, seed); var before = await State(seed);
        var path = $"/api/households/{seed.HouseholdId}/imports/{seed.ImportId}/reverse";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path, new { previewVersion = preview.PreviewVersion, confirmed = true })).StatusCode);
        Assert.Equal(before, await State(seed));
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var member = await db.HouseholdMembers.SingleAsync(m => m.HouseholdId == seed.HouseholdId && m.UserId == seed.UserId);
            db.Entry(member).Property(m => m.Role).CurrentValue = HouseholdRole.Viewer; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await Reverse(client, seed, preview.PreviewVersion)).StatusCode);
        Assert.Equal(before, await State(seed));
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var member = await db.HouseholdMembers.SingleAsync(m => m.HouseholdId == seed.HouseholdId && m.UserId == seed.UserId);
            db.Entry(member).Property(m => m.Role).CurrentValue = HouseholdRole.Owner; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await Reverse(client, seed, preview.PreviewVersion)).StatusCode);
        var reversedState = await State(seed);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var member = await db.HouseholdMembers.SingleAsync(m => m.HouseholdId == seed.HouseholdId && m.UserId == seed.UserId);
            db.Entry(member).Property(m => m.Status).CurrentValue = HouseholdMemberStatus.Disabled; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await Reverse(client, seed, preview.PreviewVersion)).StatusCode);
        Assert.Equal(reversedState, await State(seed));
    }

    [Theory]
    [InlineData("sample.csv")]
    [InlineData("sample.xlsx")]
    public async Task ConfirmedUndoVoidsWholeBatchKeepsHistoryAndAuditsExactlyOnce(string filename)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, filename: filename);
        var preview = await Preview(client, seed);
        var response = await Reverse(client, seed, preview.PreviewVersion);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<ReverseImportResult>())!;
        Assert.Equal(3, result.ReversedTransactionCount); Assert.False(result.AlreadyReversed);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            Assert.Equal(ImportFileStatus.Reversed, (await db.ImportFiles.SingleAsync(f => f.Id == seed.ImportId)).Status);
            var transactions = await db.Transactions.Where(t => t.ImportFileId == seed.ImportId).ToListAsync();
            Assert.Equal(3, transactions.Count); Assert.All(transactions, t => Assert.True(t.IsVoided));
            var drafts = await db.ImportTransactionDrafts.Where(d => d.ImportFileId == seed.ImportId).ToListAsync();
            Assert.Equal(preview.Items.Select(r => r.TransactionId).Order(), drafts.Select(d => d.ApprovedTransactionId).Order());
            var audit = Assert.Single(await db.AuditEvents.Where(a => a.EntityId == seed.ImportId && a.Action == AuditActions.Reversed).ToListAsync());
            Assert.Equal(seed.UserId, audit.ActorUserId); Assert.Equal(AuditVisibility.Household, audit.Visibility);
            Assert.Contains("Transactions reversed", audit.DetailsJson!); Assert.DoesNotContain(filename, audit.Summary);
            var repository = scope.ServiceProvider.GetRequiredService<IImportRepository>();
            Assert.Empty(await repository.ListDuplicateCandidatesAsync(seed.AccountId, new(2026, 10, 1), new(2026, 10, 31), default));
            Assert.True(await repository.ExistsByAccountAndHashAsync(seed.AccountId, new string('A', 64), default,
                filename.EndsWith("xlsx") ? "1" : null));
            Assert.Equal(0, (await repository.GetSummaryAsync(seed.HouseholdId, seed.UserId, default)).UnfinishedCount);
            Assert.Contains((await repository.ListVisibleAsync(seed.HouseholdId, seed.UserId, ImportListFilter.Completed, 1, 50, default)).Items,
                f => f.Id == seed.ImportId);
        }
        var after = await State(seed);
        var repeated = await Reverse(client, seed, preview.PreviewVersion);
        Assert.True((await repeated.Content.ReadFromJsonAsync<ReverseImportResult>())!.AlreadyReversed);
        Assert.Equal(after, await State(seed));
        Assert.Equal("Reversed", (await Preview(client, seed)).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client,
            $"/api/households/{seed.HouseholdId}/imports/{seed.ImportId}/complete", new { })).StatusCode);
        using var check = factory.Services.CreateScope();
        await Assert.ThrowsAsync<InvalidOperationException>(() => check.ServiceProvider.GetRequiredService<ImportReviewService>()
            .DiscardAsync(seed.HouseholdId, seed.UserId, seed.ImportId, default));
    }

    [Theory]
    [InlineData("version")]
    [InlineData("edit-after-preview")]
    [InlineData("void-after-preview")]
    [InlineData("unconfirmed")]
    public async Task StaleBlockedOrUnconfirmedUndoChangesNothing(string condition)
    {
        using var client = factory.CreateAuthenticatedTestClient(); var seed = await Seed(client);
        var preview = await Preview(client, seed);
        if (condition is "edit-after-preview" or "void-after-preview")
        {
            using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var tx = await db.Transactions.FirstAsync(t => t.ImportFileId == seed.ImportId);
            if (condition == "void-after-preview") tx.Void(seed.UserId, tx.UpdatedAtUtc.AddSeconds(1));
            else tx.UpdateDetails(null, tx.TransactionDate, null, 99m, tx.Description, null, null, false, seed.UserId, tx.UpdatedAtUtc.AddSeconds(1));
            await db.SaveChangesAsync();
        }
        var before = await State(seed);
        var response = await Reverse(client, seed, condition == "version" ? new string('0', 64) : preview.PreviewVersion,
            condition != "unconfirmed");
        Assert.Equal(condition == "unconfirmed" ? HttpStatusCode.BadRequest : HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(before, await State(seed));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FailureOrCancellationAfterDatabaseSaveRollsBackVoidsImportAndAudit(bool cancel)
    {
        using var client = factory.CreateAuthenticatedTestClient(); var seed = await Seed(client);
        var preview = await Preview(client, seed); var before = await State(seed);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            using var cancellation = new CancellationTokenSource();
            db.SavedChanges += (_, _) => {
                Assert.Equal(System.Data.IsolationLevel.Serializable,
                    db.Database.CurrentTransaction!.GetDbTransaction().IsolationLevel);
                if (cancel) { cancellation.Cancel(); throw new OperationCanceledException(cancellation.Token); }
                throw new InvalidOperationException("Injected post-save failure");
            };
            var command = scope.ServiceProvider.GetRequiredService<ImportReversalService>();
            await Assert.ThrowsAnyAsync<Exception>(() => command.ReverseAsync(seed.HouseholdId, seed.UserId, seed.ImportId,
                preview.PreviewVersion, true, cancellation.Token));
        }
        Assert.Equal(before, await State(seed));
        Assert.Equal(HttpStatusCode.OK, (await Reverse(client, seed, preview.PreviewVersion)).StatusCode);
    }

    private static Task<HttpResponseMessage> Reverse(HttpClient client, SeedData seed, string previewVersion, bool confirmed = true) =>
        TestIdentity.Post(client, $"/api/households/{seed.HouseholdId}/imports/{seed.ImportId}/reverse", new { previewVersion, confirmed });

    [Theory]
    [InlineData("sample.csv")]
    [InlineData("sample.xlsx")]
    public async Task PreviewIsReadOnlyAndKeepsExactValuesAndProvenance(string filename)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 3, filename);
        var before = await State(seed);
        var result = await Preview(client, seed);
        Assert.True(result.CanReverse);
        Assert.Equal(3, result.LinkedTransactionCount);
        Assert.Equal(3, result.EligibleRowCount);
        Assert.Equal(0, result.BlockedRowCount);
        Assert.Empty(result.BlockingReasons);
        Assert.Equal(new[] { -2.3456m, -0.0001m, 12.3456m }, result.Items.Select(r => r.Amount!.Value));
        Assert.All(result.Items, row => {
            Assert.True(row.IsEligible);
            Assert.NotNull(row.TransactionId);
            Assert.Equal(row.TransactionUpdatedAtUtc, row.DraftUpdatedAtUtc);
        });
        Assert.Equal(filename.EndsWith("xlsx") ? "Transactions" : null, result.SourceWorksheetName);
        Assert.Equal(before, await State(seed));
        await Preview(client, seed);
        Assert.Equal(before, await State(seed));
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IImportReversalRepository>().GetSnapshotAsync(seed.ImportId, 10000, default);
        Assert.Empty(scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().ChangeTracker.Entries());
    }

    [Theory]
    [InlineData("edit")]
    [InlineData("same-time-edit")]
    [InlineData("void")]
    [InlineData("inclusion")]
    [InlineData("audit-only")]
    public async Task AnyChangedTransactionBlocksTheWholeBatch(string change)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var tx = await db.Transactions.Include(t => t.PersonalBudgetInclusions)
                .SingleAsync(t => t.ImportFileId == seed.ImportId && t.ImportRowNumber == 2);
            var later = tx.UpdatedAtUtc.AddMinutes(1);
            if (change is "edit" or "same-time-edit") tx.UpdateDetails(tx.CategoryId, tx.TransactionDate,
                tx.PostedDate, 999m, tx.Description, tx.MerchantName, tx.Notes, tx.IsExcludedFromBudget,
                seed.UserId, change == "same-time-edit" ? tx.UpdatedAtUtc : later);
            if (change == "void") tx.Void(seed.UserId, later);
            if (change == "inclusion") tx.SetBudgetInclusionForUser(seed.UserId, true, true, later);
            if (change == "audit-only") db.AuditEvents.Add(AuditEvent.Create(seed.HouseholdId,
                seed.UserId, AuditVisibility.Household, null, Now, AuditActions.Updated,
                AuditEntityTypes.Transaction, tx.Id, "Changed then restored."));
            await db.SaveChangesAsync();
        }
        var before = await State(seed);
        var result = await Preview(client, seed);
        Assert.False(result.CanReverse);
        Assert.Equal(1, result.BlockedRowCount);
        Assert.Equal(2, result.EligibleRowCount);
        Assert.Contains(result.BlockingReasons, r => r.Contains("partial reversal"));
        Assert.NotEmpty(result.Items[0].BlockingReasons);
        Assert.Equal(before, await State(seed));
        Assert.Equal(HttpStatusCode.Conflict, (await Reverse(client, seed, result.PreviewVersion)).StatusCode);
        Assert.Equal(before, await State(seed));
    }

    [Fact]
    public async Task RowsAreBoundedStableAndClampedAcrossPages()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 205);
        var first = await Preview(client, seed);
        var second = await Preview(client, seed, 2);
        var last = await Preview(client, seed, int.MaxValue);
        Assert.Equal(205, first.EligibleRowCount);
        Assert.Equal(100, first.Items.Count);
        Assert.Equal(100, second.Items.Count);
        Assert.Equal(5, last.Items.Count);
        Assert.Equal(3, last.Page);
        Assert.Equal(205, first.Items.Concat(second.Items).Concat(last.Items).Select(r => r.DraftId).Distinct().Count());
        Assert.Equal(first.Items.Select(r => r.DraftId), (await Preview(client, seed)).Items.Select(r => r.DraftId));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"{Path(seed)}?page=0")).StatusCode);
    }

    [Fact]
    public async Task ViewerCanPreviewOwnPersonalImportButNotHouseholdOrAnotherMembersPrivateImport()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(owner);
        using var viewer = factory.CreateAuthenticatedTestClient();
        var viewerId = await TestIdentity.RegisterAndSignIn(viewer, $"undo-viewer-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        SeedData personal;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var home = await db.Households.Include(h => h.Members).SingleAsync(h => h.Id == seed.HouseholdId);
            db.HouseholdMembers.Add(home.AddInvitedMember(viewerId, HouseholdRole.Viewer, seed.UserId, Now));
            var account = Account.CreatePersonal(home.Id, viewerId, "Private account", AccountType.Chequing, "CAD", null, null, Now);
            db.Accounts.Add(account);
            await db.SaveChangesAsync();
            personal = await AddCompleted(scope.ServiceProvider, viewerId, home.Id, account.Id, 2, "personal.csv", personal: true);
        }
        Assert.True((await Preview(viewer, personal)).CanReverse);
        var personalVersion = (await Preview(viewer, personal)).PreviewVersion;
        Assert.Equal(HttpStatusCode.NotFound, (await Reverse(owner, personal, personalVersion)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Reverse(viewer, seed, new string('A', 64))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Reverse(viewer, personal, personalVersion)).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var audit = await scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().AuditEvents
                .SingleAsync(a => a.EntityId == personal.ImportId && a.Action == AuditActions.Reversed);
            Assert.Equal(AuditVisibility.Personal, audit.Visibility); Assert.Equal(viewerId, audit.OwnerUserId);
            var activity = scope.ServiceProvider.GetRequiredService<IAuditRepository>();
            Assert.DoesNotContain((await activity.ListVisibleAsync(seed.HouseholdId, seed.UserId, null, null, null,
                AuditActions.Reversed, null, 0, 100, default)).Items, item => item.EntityId == personal.ImportId);
            Assert.Contains((await activity.ListVisibleAsync(seed.HouseholdId, viewerId, null, null, null,
                AuditActions.Reversed, null, 0, 100, default)).Items, item => item.EntityId == personal.ImportId);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync(Path(seed))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(Path(personal))).StatusCode);
        using var outsider = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(outsider, $"undo-outsider-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(Path(seed))).StatusCode);
        using var anonymous = factory.CreateAuthenticatedTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Path(seed))).StatusCode);
    }

    [Fact]
    public async Task UnexpectedTransactionsOrMissingLinksCannotProduceAnEligibleBatch()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var draft = await db.ImportTransactionDrafts.FirstAsync(d => d.ImportFileId == seed.ImportId);
            db.Entry(draft).Property(d => d.ApprovedTransactionId).CurrentValue = null;
            await db.SaveChangesAsync();
        }
        var result = await Preview(client, seed);
        Assert.False(result.CanReverse);
        Assert.Equal(2, result.BlockedRowCount); // Missing approved link plus unexpected official transaction.
        Assert.Contains(result.Items, row => row.DraftId is null && row.Description is null);
    }

    [Fact]
    public async Task ExcludedOnlyAndUnfinishedImportsDoNotOfferUndo()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        Guid emptyId, pendingId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var empty = ImportFile.Create(seed.HouseholdId, seed.AccountId, seed.UserId, "excluded.csv", 100, new string('B', 64), Now);
            empty.StartProcessing(Now);
            empty.MarkReadyForReview(new(1, 1, 0, 0, 1, 0), Now);
            var excluded = ImportTransactionDraft.Create(empty.Id, 2, "{}", new DateOnly(2026, 10, 1), 1m, "Excluded", null, Now);
            excluded.Exclude(seed.UserId, Now);
            db.ImportFiles.Add(empty); db.ImportTransactionDrafts.Add(excluded);
            await db.SaveChangesAsync();
            await scope.ServiceProvider.GetRequiredService<ImportReviewService>().CompleteAsync(seed.HouseholdId, seed.UserId, empty.Id, default);
            emptyId = empty.Id;
            var pending = ImportFile.Create(seed.HouseholdId, seed.AccountId, seed.UserId, "pending.csv", 100, new string('C', 64), Now);
            db.ImportFiles.Add(pending); await db.SaveChangesAsync(); pendingId = pending.Id;
        }
        var preview = await Preview(client, seed with { ImportId = emptyId });
        Assert.False(preview.CanReverse); Assert.Equal(0, preview.LinkedTransactionCount);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(Path(seed with { ImportId = pendingId }))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Path(seed with { ImportId = Guid.NewGuid() }))).StatusCode);
    }

    [Fact]
    public async Task CorruptCrossHouseholdLinkIsBlockedWithoutReturningForeignValues()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var otherHome = Household.Create("Other", "CAD", "America/Vancouver", seed.UserId, Now);
            var account = Account.CreatePersonal(otherHome.Id, seed.UserId, "Secret account", AccountType.Chequing, "CAD", null, null, Now);
            db.Households.Add(otherHome); db.Accounts.Add(account); await db.SaveChangesAsync();
            var other = await AddCompleted(scope.ServiceProvider, seed.UserId, otherHome.Id, account.Id, 1, "private.csv", true);
            var foreign = await db.Transactions.SingleAsync(t => t.ImportFileId == other.ImportId);
            foreign.UpdateDetails(null, foreign.TransactionDate, null, 9876.5432m, "FOREIGN-PRIVATE-DESCRIPTION", null, null, false,
                seed.UserId, foreign.UpdatedAtUtc.AddMinutes(1));
            var foreignDraft = await db.ImportTransactionDrafts.SingleAsync(d => d.ImportFileId == other.ImportId);
            db.Entry(foreignDraft).Property(d => d.ApprovedTransactionId).CurrentValue = null;
            await db.SaveChangesAsync();
            var selected = await db.ImportTransactionDrafts.SingleAsync(d => d.ImportFileId == seed.ImportId && d.SourceRowNumber == 2);
            db.Entry(selected).Property(d => d.ApprovedTransactionId).CurrentValue = foreign.Id;
            await db.SaveChangesAsync();
        }
        var response = await client.GetAsync(Path(seed));
        Assert.True(response.IsSuccessStatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("FOREIGN-PRIVATE-DESCRIPTION", text);
        Assert.DoesNotContain("9876.5432", text);
        var preview = (await response.Content.ReadFromJsonAsync<ImportReversalPreview>())!;
        Assert.False(preview.CanReverse);
        var row = Assert.Single(preview.Items, row => row.SourceRowNumber == 2 && row.DraftId.HasValue);
        Assert.False(row.IsEligible); Assert.Null(row.TransactionId);
        Assert.Contains(row.BlockingReasons, reason => reason.Contains("linkage does not match"));
    }

    private async Task<SeedData> Seed(HttpClient client, int rows = 3, string filename = "sample.csv")
    {
        var user = await TestIdentity.RegisterAndSignIn(client, $"undo-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var home = Household.Create("Undo preview", "CAD", "America/Vancouver", user, Now);
        var account = Account.CreateHousehold(home.Id, "Shared", AccountType.Chequing, "CAD", null, null, Now);
        db.Households.Add(home); db.Accounts.Add(account); await db.SaveChangesAsync();
        return await AddCompleted(scope.ServiceProvider, user, home.Id, account.Id, rows, filename);
    }

    private static async Task<SeedData> AddCompleted(IServiceProvider services, Guid user, Guid home, Guid account, int rows, string filename, bool personal = false)
    {
        var db = services.GetRequiredService<BudgetAppDbContext>();
        var file = ImportFile.Create(home, account, user, filename, 100, new string('A', 64), Now);
        if (filename.EndsWith("xlsx")) file.SetWorksheetSource("1", "Transactions");
        file.StartProcessing(Now); file.MarkReadyForReview(new(rows, rows, 0, rows, 0, 0), Now);
        var drafts = Enumerable.Range(0, rows).Select(i => {
            var d = ImportTransactionDraft.Create(file.Id, i + 2, "{}", new DateOnly(2026, 10, 1),
                i == 0 ? -2.3456m : i == 1 ? -0.0001m : 12.3456m, $"Sample {i}", null, Now);
            d.SetBudgetInclusion(!personal, personal ? user : null, Now);
            d.SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, Now); d.Approve(user, false, Now);
            return d;
        }).ToList();
        db.ImportFiles.Add(file); db.ImportTransactionDrafts.AddRange(drafts); await db.SaveChangesAsync();
        await services.GetRequiredService<ImportReviewService>().CompleteAsync(home, user, file.Id, default);
        return new(user, home, account, file.Id);
    }

    private async Task<string> State(SeedData seed)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var file = await db.ImportFiles.AsNoTracking().SingleAsync(f => f.Id == seed.ImportId);
        var transactions = await db.Transactions.AsNoTracking().Where(t => t.ImportFileId == seed.ImportId).OrderBy(t => t.Id).ToListAsync();
        return System.Text.Json.JsonSerializer.Serialize(new { file.Status, file.UpdatedAtUtc,
            Transactions = transactions.Select(t => new { t.Id, t.Amount, t.IsVoided, t.UpdatedAtUtc }),
            AuditCount = await db.AuditEvents.CountAsync(a => a.HouseholdId == seed.HouseholdId) });
    }
    private static string Path(SeedData seed) => $"/api/households/{seed.HouseholdId}/imports/{seed.ImportId}/reversal-preview";
    private static async Task<ImportReversalPreview> Preview(HttpClient client, SeedData seed, int page = 1)
    {
        var response = await client.GetAsync($"{Path(seed)}?page={page}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ImportReversalPreview>())!;
    }
    private sealed record SeedData(Guid UserId, Guid HouseholdId, Guid AccountId, Guid ImportId);
}
