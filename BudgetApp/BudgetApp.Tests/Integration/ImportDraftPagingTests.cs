using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit.Abstractions;

namespace BudgetApp.Tests.Integration;

public sealed class ImportDraftPagingTests(BudgetAppWebApplicationFactory factory, ITestOutputHelper output)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
    private const string Raw = "{\"Category\":\" Housing \",\"Sub_Category\":\" Rent \",\"unused-private-column\":\"do not return this\"}";

    [Theory]
    [InlineData(100)]
    [InlineData(1000)]
    [InlineData(10000)]
    public async Task PagesStayBoundedAndStableWhileGlobalCountsRemainExact(int rowCount)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, rowCount);
        var response = await client.GetAsync($"{Path(seed)}/drafts?pageSize=10000"); // Unsupported page-size input cannot raise the fixed bound.
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var bytes = await response.Content.ReadAsByteArrayAsync();
        var page = JsonSerializer.Deserialize<ImportDraftPageResult>(bytes, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(100, page.PageSize);
        Assert.Equal(100, page.Items.Count);
        Assert.Equal(rowCount, page.TotalCount);
        Assert.Equal(rowCount / 100, page.TotalPages);
        Assert.Equal(new ImportDraftCounts(rowCount, rowCount, 0, 0, 0, 0, rowCount, rowCount, rowCount), page.Summary.Counts);
        Assert.Equal(Enumerable.Range(2, 100), page.Items.Select(item => item.SourceRowNumber));
        Assert.All(page.Items, item => { Assert.Equal("Housing", item.ImportedCategoryName); Assert.Equal("Rent", item.ImportedSubcategoryName); });
        Assert.DoesNotContain("unused-private-column", System.Text.Encoding.UTF8.GetString(bytes));
        Assert.True(bytes.Length < 200_000, "A 100-row response is bounded independently of batch size, not machine latency.");
        var again = await Page(client, seed);
        Assert.Equal(page.Items.Select(item => item.Id), again.Items.Select(item => item.Id));
        var last = await Page(client, seed, page: int.MaxValue);
        Assert.Equal(rowCount / 100, last.Page);
        Assert.Equal(rowCount + 1, last.Items.Last().SourceRowNumber);
        if (rowCount > 100) Assert.Empty(page.Items.Select(item => item.Id).Intersect(last.Items.Select(item => item.Id)));
        var summary = await client.GetFromJsonAsync<ImportReviewSummary>($"{Path(seed)}/summary");
        Assert.Equal(page.Summary, summary);
        var legacyResponse = await client.GetAsync(Path(seed));
        var legacyBytes = await legacyResponse.Content.ReadAsByteArrayAsync();
        var legacy = JsonSerializer.Deserialize<ImportReviewDetail>(legacyBytes, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(rowCount, legacy.Drafts.Count); // Compatibility endpoint is deliberately unchanged until UI integration.
        Assert.Equal(legacy.Drafts.Take(100), page.Items);
        output.WriteLine($"ROWS={rowCount}; LEGACY_BYTES={legacyBytes.Length}; PAGE_BYTES={bytes.Length}; SUMMARY_BYTES={JsonSerializer.SerializeToUtf8Bytes(summary, new JsonSerializerOptions(JsonSerializerDefaults.Web)).Length}");
    }

    [Fact]
    public async Task EveryFilterMatchesTheExistingScreenIncludingInactiveParentsAndRootLeaves()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 8);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var parent = Category.CreateRoot(seed.HouseholdId, "Parent", CategoryType.Expense, 0, Now);
            var child = parent.AddSubcategory("Child", 0, Now);
            var rootLeaf = Category.CreateRoot(seed.HouseholdId, "Root leaf", CategoryType.Expense, 1, Now);
            child.Deactivate(Now);
            parent.Deactivate(Now); // Existing screen includes inactive parents with children.
            db.Categories.AddRange(parent, rootLeaf);
            await db.SaveChangesAsync();
            var rows = await db.ImportTransactionDrafts.Where(row => row.ImportFileId == seed.ImportId).OrderBy(row => row.SourceRowNumber).ToListAsync();
            rows[0].SelectCategory(parent.Id, Now);
            rows[1].SelectCategory(child.Id, Now);
            rows[2].SelectCategory(rootLeaf.Id, Now);
            rows[3].CorrectParsedValues(null, rows[3].Amount, rows[3].Description, null, Now);
            rows[4].SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, Now);
            rows[4].Approve(seed.UserId, false, Now);
            rows[5].Exclude(seed.UserId, Now);
            var candidate = Transaction.CreateManual(seed.HouseholdId, seed.AccountId, null, new DateOnly(2026, 10, 1),
                null, 12.3456m, "Synthetic duplicate candidate", null, null, false, seed.UserId, Now);
            db.Transactions.Add(candidate);
            rows[6].SetDuplicateResult(ImportDraftDuplicateStatus.PossibleDuplicate, candidate.Id, Now);
            await db.SaveChangesAsync();
            // Stored file counters are deliberately stale here: the read aggregate
            // must still reflect actual global rows, not the filtered page or cache.
        }
        var expectedRows = new Dictionary<ImportDraftFilter, int[]>
        {
            [ImportDraftFilter.All] = [2, 3, 4, 5, 6, 7, 8, 9],
            [ImportDraftFilter.Pending] = [2, 3, 4, 5, 8, 9],
            [ImportDraftFilter.Uncategorized] = [5, 6, 7, 8, 9],
            [ImportDraftFilter.ParentOnly] = [2],
            [ImportDraftFilter.Categorized] = [2, 3, 4],
            [ImportDraftFilter.PossibleDuplicates] = [8],
            [ImportDraftFilter.Invalid] = [5],
            [ImportDraftFilter.Approved] = [6],
            [ImportDraftFilter.Excluded] = [7]
        };
        var legacy = (await client.GetFromJsonAsync<ImportReviewDetail>(Path(seed)))!;
        foreach (var (filter, rows) in expectedRows)
        {
            var page = await Page(client, seed, filter);
            Assert.Equal(rows, page.Items.Select(item => item.SourceRowNumber));
            Assert.Equal(rows.Length, page.TotalCount);
            Assert.Equal(new ImportDraftCounts(8, 7, 1, 1, 1, 1, 6, 6, 5), page.Summary.Counts);
            Assert.Equal(legacy.Drafts.Where(row => rows.Contains(row.SourceRowNumber)), page.Items);
        }
    }

    [Fact]
    public async Task StatusChangesClampFilteredPagesAndEmptyFiltersHaveZeroResults()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 101);
        var last = await Page(client, seed, ImportDraftFilter.Pending, 2);
        Assert.Single(last.Items);
        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
            await service.SetDecisionAsync(seed.HouseholdId, seed.UserId, seed.ImportId, last.Items[0].Id,
                "Excluded", false, CancellationToken.None);
        }
        var clamped = await Page(client, seed, ImportDraftFilter.Pending, 2);
        Assert.Equal(1, clamped.Page);
        Assert.Equal(100, clamped.TotalCount);
        Assert.Equal(1, clamped.Summary.Counts.ExcludedRows);
        Assert.Equal(101, clamped.Summary.Counts.TotalRows);
        var empty = await Page(client, seed, ImportDraftFilter.Approved, int.MaxValue);
        Assert.Empty(empty.Items);
        Assert.Equal(1, empty.Page);
        Assert.Equal(0, empty.TotalPages);
        Assert.Equal(0, empty.TotalCount);
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("page=-1")]
    [InlineData("page=2147483648")]
    [InlineData("filter=unsupported")]
    [InlineData("filter=999")]
    public async Task InvalidQueryCannotTriggerUnboundedReads(string query)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 1);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"{Path(seed)}/drafts?{query}")).StatusCode);
    }

    [Fact]
    public async Task EmptyBatchSummaryAndPageAreSuccessfulZeros()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 0);
        var page = await Page(client, seed);
        Assert.Empty(page.Items);
        Assert.Equal(ImportDraftCounts.Empty, page.Summary.Counts);
        Assert.Equal(0, page.TotalPages);
        Assert.Equal(1, page.Page);
    }

    [Fact]
    public async Task WorksheetAndOriginalRowProvenanceAndSignedAmountsMatchLegacyReads()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 2);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var file = await db.ImportFiles.SingleAsync(item => item.Id == seed.ImportId);
            file.SetWorksheetSource("sheet-2", "Transactions");
            await db.SaveChangesAsync();
        }
        var page = await Page(client, seed);
        Assert.Equal("Transactions", page.Summary.SourceWorksheetName);
        Assert.Equal(new[] { 2, 3 }, page.Items.Select(item => item.SourceRowNumber));
        Assert.Equal(new decimal?[] { 12.3456m, -12.3456m }, page.Items.Select(item => item.Amount));
        Assert.Equal((await client.GetFromJsonAsync<ImportReviewDetail>(Path(seed)))!.Drafts, page.Items);
    }

    [Fact]
    public async Task NewReadsPreservePersonalPrivacyViewerPermissionsAndHouseholdBoundaries()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var shared = await Seed(owner, 1);
        using var viewer = factory.CreateAuthenticatedTestClient();
        var viewerId = await TestIdentity.RegisterAndSignIn(viewer, $"draft-viewer-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        SeedData own, secret;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var household = await db.Households.Include(item => item.Members).SingleAsync(item => item.Id == shared.HouseholdId);
            db.HouseholdMembers.Add(household.AddInvitedMember(viewerId, HouseholdRole.Viewer, shared.UserId, Now));
            var ownAccount = Account.CreatePersonal(shared.HouseholdId, viewerId, "Own private account", AccountType.Chequing, "CAD", null, null, Now);
            var secretAccount = Account.CreatePersonal(shared.HouseholdId, shared.UserId, "Other private account", AccountType.Chequing, "CAD", null, null, Now);
            db.Accounts.AddRange(ownAccount, secretAccount);
            own = AddImport(db, shared with { UserId = viewerId, AccountId = ownAccount.Id }, 1);
            secret = AddImport(db, shared with { AccountId = secretAccount.Id }, 1);
            var row = await db.ImportTransactionDrafts.SingleAsync(item => item.ImportFileId == shared.ImportId);
            row.SetBudgetInclusion(true, shared.UserId, Now);
            await db.SaveChangesAsync();
        }
        var sharedPage = await Page(viewer, shared);
        Assert.False(sharedPage.Summary.CanEdit);
        Assert.False(sharedPage.Items[0].CanChangeHouseholdInclusion);
        Assert.False(sharedPage.Items[0].CanChangePersonalInclusion);
        var ownPage = await Page(viewer, own);
        Assert.True(ownPage.Summary.CanEdit);
        Assert.True(ownPage.Items[0].IncludeInPersonalBudget);
        Assert.False(ownPage.Items[0].CanChangeHouseholdInclusion);
        foreach (var suffix in new[] { "drafts", "summary" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync($"{Path(secret)}/{suffix}")).StatusCode);
            using var outsider = factory.CreateAuthenticatedTestClient();
            await TestIdentity.RegisterAndSignIn(outsider, $"draft-outsider-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
            Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync($"{Path(shared)}/{suffix}")).StatusCode);
            var otherHousehold = await Seed(owner, 1);
            Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/households/{otherHousehold.HouseholdId}/imports/{shared.ImportId}/{suffix}")).StatusCode);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SignedOutAndUnconfirmedAccountsCannotReadTheNewEndpoints(bool unconfirmed)
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(owner, 1);
        using var blocked = factory.CreateAuthenticatedTestClient();
        if (unconfirmed) await TestIdentity.RegisterAndSignIn(blocked, $"draft-unconfirmed-{Guid.NewGuid():N}@example.test");
        foreach (var suffix in new[] { "drafts", "summary" })
            Assert.Equal(unconfirmed ? HttpStatusCode.Forbidden : HttpStatusCode.Unauthorized,
                (await blocked.GetAsync($"{Path(seed)}/{suffix}")).StatusCode);
    }

    [Fact]
    public async Task CompletedImportsRemainReadableAndExistingCommandsStillRejectChanges()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 1);
        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
            var page = await service.GetDraftPageAsync(seed.HouseholdId, seed.UserId, seed.ImportId, ImportDraftFilter.All, 1, CancellationToken.None);
            await service.SetDecisionAsync(seed.HouseholdId, seed.UserId, seed.ImportId, page.Items[0].Id, "Excluded", false, CancellationToken.None);
            await service.CompleteAsync(seed.HouseholdId, seed.UserId, seed.ImportId, CancellationToken.None);
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.SetDecisionAsync(seed.HouseholdId, seed.UserId,
                seed.ImportId, page.Items[0].Id, "Pending", false, CancellationToken.None));
        }
        var completed = await Page(client, seed);
        Assert.Equal("Completed", completed.Summary.Status);
        Assert.Equal(1, completed.Summary.Counts.ExcludedRows);
        Assert.Equal(0, completed.Summary.Counts.PendingRows);
        Assert.Equal((await client.GetFromJsonAsync<ImportReviewDetail>(Path(seed)))!.Drafts, completed.Items);
    }

    private async Task<SeedData> Seed(HttpClient client, int rowCount)
    {
        var userId = await TestIdentity.RegisterAndSignIn(client, $"draft-paging-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        return await SeedForUser(userId, rowCount);
    }

    private async Task<SeedData> SeedForUser(Guid userId, int rowCount)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var household = Household.Create("Draft paging", "CAD", "America/Vancouver", userId, Now);
        var account = Account.CreateHousehold(household.Id, "Shared account", AccountType.Chequing, "CAD", null, null, Now);
        db.Households.Add(household);
        db.Accounts.Add(account);
        var seed = AddImport(db, new(userId, household.Id, account.Id, Guid.Empty), rowCount);
        await db.SaveChangesAsync();
        return seed;
    }

    private static SeedData AddImport(BudgetAppDbContext db, SeedData seed, int rowCount)
    {
        var file = ImportFile.Create(seed.HouseholdId, seed.AccountId, seed.UserId, "synthetic.csv", 100, new string('A', 64), Now);
        if (rowCount > 0)
        {
            file.StartProcessing(Now);
            file.MarkReadyForReview(new ImportStatistics(rowCount, rowCount, 0, 0, 0, 0), Now);
        }
        db.ImportFiles.Add(file);
        db.ImportTransactionDrafts.AddRange(Enumerable.Range(0, rowCount).Select(i => ImportTransactionDraft.Create(
            file.Id, i + 2, Raw, new DateOnly(2026, 10, 1), i % 2 == 0 ? 12.3456m : -12.3456m,
            $"Synthetic purchase {i:00000}", null, Now)));
        return seed with { ImportId = file.Id };
    }

    private static string Path(SeedData seed) => $"/api/households/{seed.HouseholdId}/imports/{seed.ImportId}";
    private static async Task<ImportDraftPageResult> Page(HttpClient client, SeedData seed, ImportDraftFilter filter = ImportDraftFilter.All, int page = 1)
    {
        var response = await client.GetAsync($"{Path(seed)}/drafts?filter={filter}&page={page}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ImportDraftPageResult>())!;
    }
    private sealed record SeedData(Guid UserId, Guid HouseholdId, Guid AccountId, Guid ImportId);

    [Theory]
    [InlineData(100)]
    [InlineData(1000)]
    [InlineData(10000)]
    public async Task TargetedHttpChangesReturnOnlyAffectedRowsAndExactSummary(int rowCount)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, rowCount);
        var original = await Page(client, seed, page: int.MaxValue);
        var row = original.Items[^1];
        var save = await Send(client, HttpMethod.Put, Versioned($"{Path(seed)}/drafts/{row.Id}", original.Summary), new {
            transactionDate = row.TransactionDate, amount = -7.1234m, description = "Target correction", selectedCategoryId = (Guid?)null });
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var changed = (await save.Content.ReadFromJsonAsync<ImportDraftMutationResult>())!;
        Assert.Equal(row.Id, Assert.Single(changed.Items).Id);
        Assert.Equal("Target correction", changed.Items[0].Description);
        Assert.Equal(rowCount, changed.Summary.Counts.TotalRows);
        Assert.Equal(rowCount - 1, changed.Summary.Counts.UncheckedDuplicateRows);
        Assert.Equal(1, changed.SavedRows);
        var bytes = (await save.Content.ReadAsByteArrayAsync()).Length;
        Assert.True(bytes < 3000);
        var approve = await TestIdentity.Post(client, Versioned($"{Path(seed)}/drafts/{row.Id}/decision", changed.Summary),
            new { decision = "Approved", acknowledgePossibleDuplicate = false });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var approved = (await approve.Content.ReadFromJsonAsync<ImportDraftMutationResult>())!;
        Assert.Equal(1, approved.Summary.Counts.ApprovedRows);
        Assert.Equal("Approved", Assert.Single(approved.Items).ReviewDecision);
        var stale = await TestIdentity.Post(client, Versioned($"{Path(seed)}/drafts/{row.Id}/decision", original.Summary),
            new { decision = "Excluded", acknowledgePossibleDuplicate = false });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var remove = await Send(client, HttpMethod.Delete, Versioned($"{Path(seed)}/drafts/{row.Id}", approved.Summary));
        Assert.Equal(HttpStatusCode.OK, remove.StatusCode);
        var removed = (await remove.Content.ReadFromJsonAsync<ImportDraftMutationResult>())!;
        Assert.Empty(removed.Items);
        Assert.Equal([row.Id], removed.RemovedDraftIds);
        Assert.Equal(rowCount - 1, removed.Summary.Counts.TotalRows);
        Assert.Equal(0, removed.Summary.Counts.ApprovedRows);
        Assert.Equal(removed.Summary, await client.GetFromJsonAsync<ImportReviewSummary>($"{Path(seed)}/summary"));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(rowCount - 1, await db.ImportTransactionDrafts.CountAsync(item => item.ImportFileId == seed.ImportId));
        Assert.False(await db.ImportTransactionDrafts.AnyAsync(item => item.ImportFileId == seed.ImportId && item.UpdatedAtUtc != Now));
        Assert.Equal(3, await db.AuditEvents.CountAsync(item => item.EntityId == seed.ImportId));
        Assert.False(await db.Transactions.AnyAsync(item => item.HouseholdId == seed.HouseholdId));
        output.WriteLine($"TARGET_ROWS={rowCount}; CHANGE_RESPONSE_BYTES={bytes}; RETURNED_ITEMS=1");
    }

    [Fact]
    public async Task BulkCorrectionsRemainAtomicAndReturnOnlyChangedRows()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client, 250);
        var first = await Page(client, seed);
        var last = await Page(client, seed, page: 3);
        var ids = new[] { first.Items[0].Id, first.Items[99].Id, last.Items[^1].Id };
        var updates = ids.Select((id, i) => new ImportDraftUpdateInput(id, new DateOnly(2026, 10, 1),
            i == 1 ? 0m : -2.3456m, $"Bulk correction {i}", null)).ToArray();
        var rejected = await Send(client, HttpMethod.Put, Versioned($"{Path(seed)}/drafts", first.Summary),
            new { drafts = updates.Concat([new(Guid.NewGuid(), new DateOnly(2026, 10, 1), 1m, "Foreign row", null)]) });
        Assert.Equal(HttpStatusCode.NotFound, rejected.StatusCode);
        Assert.Equal(first.Summary, await client.GetFromJsonAsync<ImportReviewSummary>($"{Path(seed)}/summary"));
        var response = await Send(client, HttpMethod.Put, Versioned($"{Path(seed)}/drafts", first.Summary), new { drafts = updates });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var changed = (await response.Content.ReadFromJsonAsync<ImportDraftMutationResult>())!;
        Assert.Equal(ids, changed.Items.Select(item => item.Id));
        Assert.Equal(3, changed.SavedRows);
        Assert.Equal(250, changed.Summary.Counts.TotalRows);
        Assert.Equal(249, changed.Summary.Counts.ValidRows);
        Assert.Equal(1, changed.Summary.Counts.InvalidRows);
        Assert.Equal(247, changed.Summary.Counts.UncheckedDuplicateRows);
        Assert.Equal(changed.Summary, await client.GetFromJsonAsync<ImportReviewSummary>($"{Path(seed)}/summary"));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(247, await db.ImportTransactionDrafts.CountAsync(item => item.ImportFileId == seed.ImportId && item.UpdatedAtUtc == Now));
        Assert.Equal(1, await db.AuditEvents.CountAsync(item => item.EntityId == seed.ImportId));
        Assert.False(await db.Transactions.AnyAsync(item => item.HouseholdId == seed.HouseholdId));
    }

    private static string Versioned(string path, ImportReviewSummary summary) =>
        $"{path}?returnChanges=true&expectedImportUpdatedAtUtc={Uri.EscapeDataString(summary.UpdatedAtUtc.ToString("O"))}";
    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, object? body = null)
    {
        var csrf = (await client.GetFromJsonAsync<AntiforgeryResponse>("/api/auth/antiforgery"))!;
        using var request = new HttpRequestMessage(method, path) { Content = body is null ? null : JsonContent.Create(body) };
        request.Headers.Add("X-XSRF-TOKEN", csrf.Token);
        return await client.SendAsync(request);
    }
    private sealed record AntiforgeryResponse(string Token);
}
