using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class ImportListingTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task OldPendingImportSurvivesNewerCompletedHistoryAndDirectLookup()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        Guid oldId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var old = File(seed, seed.AccountId, ImportFileStatus.ReadyForReview, Now.AddYears(-1));
            oldId = old.Id;
            db.ImportFiles.Add(old);
            db.ImportFiles.AddRange(Enumerable.Range(0, 60)
                .Select(i => File(seed, seed.AccountId, ImportFileStatus.Completed, Now.AddMinutes(i))));
            await db.SaveChangesAsync();
        }
        var unfinished = await List(client, seed, "Unfinished");
        Assert.Equal(oldId, Assert.Single(unfinished.Items).Id);
        Assert.Equal(61, unfinished.TotalVisibleCount);
        Assert.Equal(1, unfinished.TotalCount);
        var all = await List(client, seed, "All");
        Assert.Equal(50, all.Items.Count);
        Assert.DoesNotContain(all.Items, item => item.Id == oldId);
        Assert.Equal(61, all.TotalCount);
        Assert.Equal(2, all.TotalPages);
        var summary = await client.GetFromJsonAsync<ImportSummary>(SummaryPath(seed));
        Assert.Equal(new ImportSummary(61, 1, 1), summary);
        var detail = await client.GetFromJsonAsync<ImportReviewDetail>($"{Path(seed)}/{oldId}");
        Assert.Equal(oldId, detail!.Id);
    }

    [Fact]
    public async Task PendingCountIsUncappedAndEqualTimestampPagesAreStableDisjointAndBounded()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            db.ImportFiles.AddRange(Enumerable.Range(0, 120)
                .Select(_ => File(seed, seed.AccountId, ImportFileStatus.ReadyForReview, Now)));
            await db.SaveChangesAsync();
        }
        var first = await List(client, seed, "ReadyForReview");
        var again = await List(client, seed, "ReadyForReview");
        var second = await List(client, seed, "ReadyForReview", 2);
        var last = await List(client, seed, "ReadyForReview", int.MaxValue);
        Assert.Equal(first.Items.Select(item => item.Id), again.Items.Select(item => item.Id));
        Assert.Equal(50, first.Items.Count);
        Assert.Equal(50, second.Items.Count);
        Assert.Equal(20, last.Items.Count);
        Assert.Equal(3, last.Page);
        Assert.Equal(50, last.PageSize);
        Assert.Equal(120, first.Items.Concat(second.Items).Concat(last.Items).Select(item => item.Id).Distinct().Count());
        Assert.Equal(120, (await client.GetFromJsonAsync<ImportSummary>(SummaryPath(seed)))!.ReadyForReviewCount);
    }

    [Fact]
    public async Task UnfinishedIncludesFailedAndProcessingButReviewCountOnlyCountsReady()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            db.ImportFiles.AddRange(Enum.GetValues<ImportFileStatus>().Select(status => File(seed, seed.AccountId, status, Now)));
            await db.SaveChangesAsync();
        }
        Assert.Equal(4, (await List(client, seed, "Unfinished")).Items.Count);
        Assert.Single((await List(client, seed, "Completed")).Items);
        Assert.Single((await List(client, seed, "ReadyForReview")).Items);
        Assert.Equal(new ImportSummary(5, 4, 1), await client.GetFromJsonAsync<ImportSummary>(SummaryPath(seed)));
    }

    [Fact]
    public async Task ViewerSeesSharedAndOwnImportsButNotOtherMembersOrHouseholds()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(owner);
        using var viewer = factory.CreateAuthenticatedTestClient();
        var viewerId = await TestIdentity.RegisterAndSignIn(viewer, $"import-viewer-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        Guid ownId, privateId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var household = await db.Households.Include(h => h.Members).SingleAsync(h => h.Id == seed.HouseholdId);
            db.HouseholdMembers.Add(household.AddInvitedMember(viewerId, HouseholdRole.Viewer, seed.UserId, Now));
            var own = Account.CreatePersonal(seed.HouseholdId, viewerId, "Viewer account", AccountType.Chequing, "CAD", null, null, Now);
            var secret = Account.CreatePersonal(seed.HouseholdId, seed.UserId, "Owner private account", AccountType.Chequing, "CAD", null, null, Now);
            var otherHousehold = Household.Create("Other", "CAD", "America/Vancouver", seed.UserId, Now);
            var other = Account.CreateHousehold(otherHousehold.Id, "Other", AccountType.Chequing, "CAD", null, null, Now);
            db.Accounts.AddRange(own, secret, other);
            db.Households.Add(otherHousehold);
            var ownFile = File(seed with { UserId = viewerId }, own.Id, ImportFileStatus.ReadyForReview, Now);
            var secretFile = File(seed, secret.Id, ImportFileStatus.ReadyForReview, Now);
            ownId = ownFile.Id;
            privateId = secretFile.Id;
            db.ImportFiles.AddRange(ownFile, secretFile,
                File(seed, seed.AccountId, ImportFileStatus.ReadyForReview, Now),
                File(seed with { HouseholdId = otherHousehold.Id }, other.Id, ImportFileStatus.ReadyForReview, Now));
            await db.SaveChangesAsync();
        }
        var page = await List(viewer, seed, "All");
        Assert.Equal(2, page.TotalCount);
        Assert.True(Assert.Single(page.Items, item => item.Id == ownId).CanEdit);
        Assert.False(Assert.Single(page.Items, item => item.Id != ownId).CanEdit);
        Assert.DoesNotContain(page.Items, item => item.Id == privateId);
        Assert.Equal(new ImportSummary(2, 2, 2), await viewer.GetFromJsonAsync<ImportSummary>(SummaryPath(seed)));
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync($"{Path(seed)}/{privateId}")).StatusCode);
        using var outsider = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(outsider, $"import-outsider-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(Path(seed))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(SummaryPath(seed))).StatusCode);
    }

    [Fact]
    public async Task CompletionAndDiscardRefreshCountsAndClampTheNowEmptyLastPage()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        Guid importId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var file = File(seed, seed.AccountId, ImportFileStatus.ReadyForReview, Now);
            importId = file.Id;
            var draft = ImportTransactionDraft.Create(file.Id, 2, "{}", new DateOnly(2026, 10, 1), 12.3456m, "Synthetic", null, Now);
            draft.SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, Now);
            draft.Approve(seed.UserId, false, Now);
            db.ImportFiles.Add(file);
            db.ImportTransactionDrafts.Add(draft);
            db.ImportFiles.AddRange(Enumerable.Range(0, 50).Select(_ => File(seed, seed.AccountId, ImportFileStatus.ReadyForReview, Now)));
            await db.SaveChangesAsync();
            var service = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
            await service.CompleteAsync(seed.HouseholdId, seed.UserId, importId, CancellationToken.None);
        }
        Assert.Equal(50, (await client.GetFromJsonAsync<ImportSummary>(SummaryPath(seed)))!.ReadyForReviewCount);
        Assert.Equal(1, (await List(client, seed, "Unfinished", 2)).Page);
        Assert.Equal(importId, Assert.Single((await List(client, seed, "Completed")).Items).Id);
        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
            var unfinished = await service.ListAsync(seed.HouseholdId, seed.UserId, ImportListFilter.Unfinished, 1, CancellationToken.None);
            await service.DiscardAsync(seed.HouseholdId, seed.UserId, unfinished.Items[0].Id, CancellationToken.None);
        }
        Assert.Equal(49, (await client.GetFromJsonAsync<ImportSummary>(SummaryPath(seed)))!.ReadyForReviewCount);
    }

    [Theory]
    [InlineData("filter=unknown")]
    [InlineData("filter=99")]
    [InlineData("page=0")]
    [InlineData("page=-1")]
    public async Task InvalidQueriesAreRejected(string query)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"{Path(seed)}?{query}")).StatusCode);
    }

    [Fact]
    public async Task EmptyListAndSummaryAreSuccessfulZeroResults()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var seed = await Seed(client);
        var list = await List(client, seed, "Unfinished");
        Assert.Empty(list.Items);
        Assert.Equal(0, list.TotalCount);
        Assert.Equal(0, list.TotalPages);
        Assert.Equal(1, list.Page);
        Assert.Equal(new ImportSummary(0, 0, 0), await client.GetFromJsonAsync<ImportSummary>(SummaryPath(seed)));
    }

    private async Task<SeedData> Seed(HttpClient client)
    {
        var userId = await TestIdentity.RegisterAndSignIn(client, $"import-list-{Guid.NewGuid():N}@example.test", confirmationHost: factory);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var household = Household.Create("Import listing", "CAD", "America/Vancouver", userId, Now);
        var account = Account.CreateHousehold(household.Id, "Shared", AccountType.Chequing, "CAD", null, null, Now);
        db.Households.Add(household);
        db.Accounts.Add(account);
        await db.SaveChangesAsync();
        return new(userId, household.Id, account.Id);
    }

    private static ImportFile File(SeedData seed, Guid accountId, ImportFileStatus status, DateTimeOffset uploaded)
    {
        var file = ImportFile.Create(seed.HouseholdId, accountId, seed.UserId, $"{Guid.NewGuid():N}.csv", 100, new string('A', 64), uploaded);
        if (status == ImportFileStatus.Uploaded) return file;
        file.StartProcessing(uploaded);
        if (status == ImportFileStatus.Processing) return file;
        if (status == ImportFileStatus.Failed) { file.MarkFailed("Synthetic failure", uploaded); return file; }
        file.MarkReadyForReview(new ImportStatistics(1, 1, 0, 0, 0, 0), uploaded);
        if (status == ImportFileStatus.Completed) file.Complete(new ImportStatistics(1, 1, 0, 0, 1, 0), uploaded);
        return file;
    }

    private static string Path(SeedData seed) => $"/api/households/{seed.HouseholdId}/imports";
    private static string SummaryPath(SeedData seed) => $"{Path(seed)}/summary";
    private static async Task<ImportListResult> List(HttpClient client, SeedData seed, string filter, int page = 1)
    {
        var response = await client.GetAsync($"{Path(seed)}?filter={filter}&page={page}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ImportListResult>())!;
    }
    private sealed record SeedData(Guid UserId, Guid HouseholdId, Guid AccountId);
}
