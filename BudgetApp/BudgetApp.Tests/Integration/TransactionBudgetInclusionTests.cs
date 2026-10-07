using System.Net;
using System.Net.Http.Json;
using System.Text;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Imports;
using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Data.Migrations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class TransactionBudgetInclusionTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task SharedExpense_CountsOnceInEachScope_AndReconcilesMonthlyHistoryAndAnnualReports()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var userId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        var seed = await Seed(householdId, userId);
        await Change(owner, householdId, seed.RentId, true, true);
        await Change(owner, householdId, seed.RefundId, true, true);
        await Change(owner, householdId, (await List(owner, householdId)).Items.Single(t => t.Description == "USD expense").Id, true, true);

        foreach (var scope in new[] { "Personal", "Household" })
        {
            var month = await owner.GetFromJsonAsync<BudgetPageModel>(
                $"/api/households/{householdId}/budgets/2026/7?scope={scope}");
            Assert.Equal(1100m, month!.Categories.Single(c => c.Name == "Housing").ActualAmount);
            var next = await owner.GetFromJsonAsync<BudgetPageModel>(
                $"/api/households/{householdId}/budgets/2026/8?scope={scope}");
            Assert.Equal(1100m, next!.Categories.Single(c => c.Name == "Housing").LastMonthActualAmount);
            var annual = await Annual(owner, householdId, scope);
            Assert.Equal(1100m, annual.ActualSpendingAmount);
            Assert.Equal(1, annual.CurrencyMismatchTransactionCount);
            var filtered = await List(owner, householdId, $"budgetInclusion={scope}&currency=CAD&spendingOnly=true");
            Assert.Equal(2, filtered.TotalCount);
            Assert.Equal(annual.ActualSpendingAmount, filtered.Items.Sum(t => t.Amount));
        }
        var both = await List(owner, householdId, "budgetInclusion=PersonalAndHousehold&currency=CAD");
        Assert.Equal(2, both.Items.Count);
        Assert.Equal(2, both.Items.Select(t => t.Id).Distinct().Count());
        using var dbScope = factory.Services.CreateScope();
        var db = dbScope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(5, await db.Transactions.CountAsync(t => t.HouseholdId == householdId));
    }

    [Fact]
    public async Task PrivateAccount_SharedProjectionIsRedacted_AndPersonalChoicesAreIndependent()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        var seed = await Seed(householdId, ownerId);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(householdId, ownerId, memberId, HouseholdRole.Editor);
        Assert.Empty((await List(member, householdId)).Items);
        await Change(owner, householdId, seed.RentId, true, true);
        var shared = Assert.Single((await List(member, householdId)).Items);
        Assert.Null(shared.AccountId);
        Assert.Equal("Shared expense (private account)", shared.AccountName);
        Assert.Null(shared.Notes);
        Assert.Null(shared.MerchantName);
        Assert.Null(shared.PostedDate);
        Assert.False(shared.CanEdit);
        Assert.False(shared.CanEditHouseholdInclusion);
        Assert.False(shared.IncludeInPersonalBudget);
        Assert.Empty((await List(member, householdId, $"accountId={seed.AccountId}")).Items);
        var csv = await member.GetStringAsync($"/api/households/{householdId}/transactions/export.csv");
        Assert.DoesNotContain("SECRET", csv);
        Assert.DoesNotContain("Excluded expense", csv);
        Assert.Contains("Shared rent", csv);

        await Change(member, householdId, seed.RentId, null, true);
        Assert.Equal(1200m, (await Annual(member, householdId, "Personal")).ActualSpendingAmount);
        await Change(member, householdId, seed.RentId, null, false);
        Assert.Equal(0m, (await Annual(member, householdId, "Personal")).ActualSpendingAmount);
        Assert.True((await Item(owner, householdId, seed.RentId)).IncludeInPersonalBudget);
        await Change(member, householdId, seed.RentId, null, true);
        await Change(owner, householdId, seed.RentId, false, true);
        Assert.Empty((await List(member, householdId)).Items);
        Assert.Equal(0m, (await Annual(member, householdId, "Personal")).ActualSpendingAmount);
    }

    [Fact]
    public async Task Inclusion_RejectsOtherHouseholds_NonOwnerHouseholdChanges_AndStaleVersions()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        var seed = await Seed(householdId, ownerId);
        var original = await Item(owner, householdId, seed.RentId);
        await Change(owner, householdId, seed.RentId, true, true);
        Assert.Equal(HttpStatusCode.Conflict, (await Put(owner,
            $"/api/households/{householdId}/transactions/{seed.RentId}/budget-inclusion",
            new { includeInHouseholdBudget = true, includeInPersonalBudget = false, original.UpdatedAtUtc })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Put(owner,
            $"/api/households/{householdId}/transactions/{seed.RentId}",
            new { original.CategoryId, original.TransactionDate, original.Amount, original.Description,
                isExcludedFromBudget = false, original.UpdatedAtUtc })).StatusCode);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(householdId, ownerId, memberId, HouseholdRole.Editor);
        var shared = await Item(member, householdId, seed.RentId);
        Assert.Equal(HttpStatusCode.Forbidden, (await Put(member,
            $"/api/households/{householdId}/transactions/{seed.RentId}/budget-inclusion",
            new { includeInHouseholdBudget = false, includeInPersonalBudget = true, shared.UpdatedAtUtc })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Put(member,
            $"/api/households/{householdId}/transactions/{seed.RentId}",
            new { shared.CategoryId, shared.TransactionDate, amount = 20, description = "Tampered", isExcludedFromBudget = false })).StatusCode);
        using var outsider = factory.CreateAuthenticatedTestClient();
        await Register(outsider);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(
            $"/api/households/{householdId}/transactions")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.GetAsync(
            $"/api/households/{householdId}/transactions?budgetInclusion=AnotherUser")).StatusCode);
    }

    [Fact]
    public async Task Viewer_CanChooseOwnPersonalInclusion_ButCannotChangeHouseholdInclusion()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        var seed = await Seed(householdId, ownerId);
        await Change(owner, householdId, seed.RentId, true, true);
        using var viewer = factory.CreateAuthenticatedTestClient();
        var viewerId = await Register(viewer);
        await AddMember(householdId, ownerId, viewerId, HouseholdRole.Viewer);
        await Change(viewer, householdId, seed.RentId, null, true);
        var shared = await Item(viewer, householdId, seed.RentId);
        Assert.True(shared.IncludeInPersonalBudget);
        Assert.False(shared.CanEditHouseholdInclusion);
        Assert.Equal(HttpStatusCode.Forbidden, (await Put(viewer,
            $"/api/households/{householdId}/transactions/{seed.RentId}/budget-inclusion",
            new { includeInHouseholdBudget = false, includeInPersonalBudget = true, shared.UpdatedAtUtc })).StatusCode);
    }

    [Fact]
    public async Task ChoosingNeither_PreservesTransaction_AndFinancialEditsCannotSilentlyReclassifyIt()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var userId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        var seed = await Seed(householdId, userId);
        await Change(owner, householdId, seed.RentId, false, false);
        var row = await Item(owner, householdId, seed.RentId);
        Assert.True(row.IsExcludedFromBudget);
        Assert.False(row.IncludeInPersonalBudget);
        Assert.False(row.IncludeInHouseholdBudget);
        Assert.Contains((await List(owner, householdId, "budgetInclusion=NotIncluded")).Items, t => t.Id == row.Id);
        Assert.Equal(0m, (await Annual(owner, householdId, "Household")).ActualSpendingAmount);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(owner,
            $"/api/households/{householdId}/transactions/{row.Id}",
            new { row.CategoryId, row.TransactionDate, row.Amount, row.Description, isExcludedFromBudget = false, row.UpdatedAtUtc })).StatusCode);
        await Change(owner, householdId, row.Id, true, true);
        row = await Item(owner, householdId, row.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await Put(owner,
            $"/api/households/{householdId}/transactions/{row.Id}",
            new { row.CategoryId, row.TransactionDate, amount = 1500, row.Description, isExcludedFromBudget = false, row.UpdatedAtUtc })).StatusCode);
        Assert.Equal(1500m, (await Annual(owner, householdId, "Household")).ActualSpendingAmount);
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public async Task ImportReview_PersistsChoicesAndCompletesExactlyOnce(bool household, bool personal)
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var userId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        var seed = await Seed(householdId, userId);
        var upload = new MultipartFormDataContent();
        upload.Add(new StringContent(seed.AccountId.ToString()), "AccountId");
        upload.Add(new ByteArrayContent(Encoding.UTF8.GetBytes(
            "Date,Description,Amount\n2026-07-05,Imported rent,-1300\n")), "File", "sample.csv");
        var uploaded = await Send(owner, HttpMethod.Post, $"/api/households/{householdId}/imports", upload);
        Assert.Equal(HttpStatusCode.Created, uploaded.StatusCode);
        var imported = await uploaded.Content.ReadFromJsonAsync<UploadResult>();
        var path = $"/api/households/{householdId}/imports/{imported!.ImportFileId}";
        var review = (await owner.GetFromJsonAsync<ImportReviewDetail>(path))!;
        var draft = Assert.Single(review.Drafts);
        Assert.False(draft.IncludeInHouseholdBudget);
        Assert.True(draft.IncludeInPersonalBudget);
        Assert.Equal(HttpStatusCode.NoContent, (await Put(owner, $"{path}/drafts/{draft.Id}", new {
            transactionDate = "2026-07-05", amount = 1300, description = "Imported rent",
            selectedCategoryId = seed.CategoryId,
            includeInHouseholdBudget = household, includeInPersonalBudget = personal
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(owner, HttpMethod.Post, $"{path}/drafts/{draft.Id}/decision",
            JsonContent.Create(new { decision = "Approved", acknowledgePossibleDuplicate = false }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Send(owner, HttpMethod.Post, $"{path}/complete", JsonContent.Create(new { }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Send(owner, HttpMethod.Post, $"{path}/complete", JsonContent.Create(new { }))).StatusCode);
        var row = Assert.Single((await List(owner, householdId)).Items, t => t.Description == "Imported rent");
        Assert.Equal(household, row.IncludeInHouseholdBudget);
        Assert.Equal(personal, row.IncludeInPersonalBudget);
        Assert.Equal(!household && !personal, row.IsExcludedFromBudget);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(householdId, userId, memberId, HouseholdRole.Editor);
        Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task PersonalInclusionOnSharedAccount_DoesNotLeakThroughExcludedFlagOrBlockFinancialEdits()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(householdId, ownerId, memberId, HouseholdRole.Editor);
        Guid id;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var account = Account.CreateHousehold(householdId, "Shared account", AccountType.Chequing,
                "CAD", null, null, DateTimeOffset.UtcNow);
            var transaction = Make(householdId, account.Id, null, ownerId, 100, "Personal use of shared account");
            transaction.InitializeBudgetInclusion(true, null);
            transaction.SetBudgetInclusionForUser(ownerId, false, true, DateTimeOffset.UtcNow);
            id = transaction.Id;
            db.Accounts.Add(account);
            db.Transactions.Add(transaction);
            await db.SaveChangesAsync();
        }
        Assert.False((await Item(owner, householdId, id)).IsExcludedFromBudget);
        var other = await Item(member, householdId, id);
        Assert.True(other.IsExcludedFromBudget);
        Assert.False(other.IncludeInPersonalBudget);
        Assert.False(other.IncludeInHouseholdBudget);
        Assert.Single((await List(member, householdId, "budgetInclusion=NotIncluded")).Items);
        var csv = await member.GetStringAsync($"/api/households/{householdId}/transactions/export.csv");
        Assert.Contains("Excluded,Not included", csv);
        Assert.Equal(HttpStatusCode.NoContent, (await Put(member,
            $"/api/households/{householdId}/transactions/{id}", new {
                other.CategoryId, other.TransactionDate, amount = 150, other.Description, other.UpdatedAtUtc
            })).StatusCode);
        Assert.True((await Item(owner, householdId, id)).IncludeInPersonalBudget);
        Assert.True((await Item(member, householdId, id)).IsExcludedFromBudget);
    }

    [Fact]
    public async Task SharedImport_PersonalSelectionBelongsToReviewer_NotCompleter()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(householdId, ownerId, memberId, HouseholdRole.Editor);
        Guid accountId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var account = Account.CreateHousehold(householdId, "Shared import account", AccountType.Chequing,
                "CAD", null, null, DateTimeOffset.UtcNow);
            accountId = account.Id;
            db.Accounts.Add(account);
            await db.SaveChangesAsync();
        }
        using var upload = new MultipartFormDataContent();
        upload.Add(new StringContent(accountId.ToString()), "accountId");
        upload.Add(new ByteArrayContent(Encoding.UTF8.GetBytes(
            "Date,Description,Amount\n2026-07-05,Shared imported expense,-100\n")), "file", "sample.csv");
        var imported = await (await Send(owner, HttpMethod.Post,
            $"/api/households/{householdId}/imports", upload)).Content.ReadFromJsonAsync<UploadResult>();
        var path = $"/api/households/{householdId}/imports/{imported!.ImportFileId}";
        var draft = Assert.Single((await owner.GetFromJsonAsync<ImportReviewDetail>(path))!.Drafts);
        var draftPath = $"{path}/drafts/{draft.Id}";
        Assert.Equal(HttpStatusCode.NoContent, (await Put(owner, draftPath, new {
            draft.TransactionDate, draft.Amount, draft.Description, draft.SelectedCategoryId,
            includeInHouseholdBudget = true, includeInPersonalBudget = true
        })).StatusCode);
        var memberDraft = Assert.Single((await member.GetFromJsonAsync<ImportReviewDetail>(path))!.Drafts);
        Assert.False(memberDraft.CanChangePersonalInclusion);
        Assert.False(memberDraft.IncludeInPersonalBudget);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(member, draftPath, new {
            draft.TransactionDate, draft.Amount, draft.Description, draft.SelectedCategoryId,
            includeInHouseholdBudget = true, includeInPersonalBudget = true
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Put(member, draftPath, new {
            draft.TransactionDate, draft.Amount, draft.Description, draft.SelectedCategoryId,
            includeInHouseholdBudget = true, includeInPersonalBudget = false
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, HttpMethod.Post, $"{draftPath}/decision",
            JsonContent.Create(new { decision = "Approved", acknowledgePossibleDuplicate = false }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Send(member, HttpMethod.Post, $"{path}/complete", JsonContent.Create(new { }))).StatusCode);
        var row = Assert.Single((await List(owner, householdId)).Items);
        Assert.True(row.IncludeInPersonalBudget);
        Assert.True(row.IncludeInHouseholdBudget);
        Assert.False(Assert.Single((await List(member, householdId)).Items).IncludeInPersonalBudget);
        using var dbScope = factory.Services.CreateScope();
        var context = dbScope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(memberId, (await context.Transactions.SingleAsync(t => t.Id == row.Id)).LastModifiedByUserId);
    }

    [Fact]
    public void SqlServerMigration_DefersBackfillCompilationForIdempotentScripts()
    {
        var migration = new AddTransactionBudgetInclusion { ActiveProvider = "Microsoft.EntityFrameworkCore.SqlServer" };
        var sql = Assert.Single(migration.UpOperations.OfType<SqlOperation>()).Sql;
        Assert.StartsWith("EXEC(N'", sql);
        Assert.Contains("= ''Household''", sql);
        Assert.EndsWith("');", sql);
    }

    [Fact]
    public async Task MigrationBackfill_PreservesLegacyAccountDefaultsAndExcludedRows()
    {
        using var isolated = new BudgetAppWebApplicationFactory();
        using var owner = isolated.CreateAuthenticatedTestClient();
        var userId = await TestIdentity.RegisterAndSignIn(owner, confirmationHost: isolated);
        var householdId = await CreateHousehold(owner);
        using var scope = isolated.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var now = DateTimeOffset.UtcNow;
        var household = Account.CreateHousehold(householdId, "Shared", AccountType.Chequing, "CAD", null, null, now);
        var personal = Account.CreatePersonal(householdId, userId, "Private", AccountType.Chequing, "CAD", null, null, now);
        var shared = Make(householdId, household.Id, null, userId, 1, "Shared");
        var mine = Make(householdId, personal.Id, null, userId, 2, "Personal");
        var excluded = Make(householdId, personal.Id, null, userId, 3, "Excluded", true);
        db.Accounts.AddRange(household, personal);
        db.Transactions.AddRange(shared, mine, excluded);
        await db.SaveChangesAsync();
        foreach (var operation in new AddTransactionBudgetInclusion().UpOperations.OfType<SqlOperation>())
            await db.Database.ExecuteSqlRawAsync(operation.Sql);
        db.ChangeTracker.Clear();
        var rows = await db.Transactions.Include(t => t.PersonalBudgetInclusions).ToListAsync();
        Assert.True(rows.Single(t => t.Id == shared.Id).IncludeInHouseholdBudget);
        Assert.Empty(rows.Single(t => t.Id == shared.Id).PersonalBudgetInclusions);
        Assert.False(rows.Single(t => t.Id == mine.Id).IncludeInHouseholdBudget);
        Assert.Equal(userId, Assert.Single(rows.Single(t => t.Id == mine.Id).PersonalBudgetInclusions).UserId);
        Assert.Empty(rows.Single(t => t.Id == excluded.Id).PersonalBudgetInclusions);
        Assert.True(rows.Single(t => t.Id == excluded.Id).IsExcludedFromBudget);
    }

    private async Task<SeedResult> Seed(Guid householdId, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var categoryId = await db.Categories.Where(c => c.HouseholdId == householdId && c.Name == "Housing").Select(c => c.Id).SingleAsync();
        var now = DateTimeOffset.UtcNow;
        var account = Account.CreatePersonal(householdId, userId, "SECRET ACCOUNT", AccountType.Chequing, "CAD", "SECRET BANK", "1234", now);
        var usd = Account.CreatePersonal(householdId, userId, "USD", AccountType.Chequing, "USD", null, null, now);
        var rent = Make(householdId, account.Id, categoryId, userId, 1200, "Shared rent");
        var refund = Make(householdId, account.Id, categoryId, userId, -100, "Rent refund");
        var excluded = Make(householdId, account.Id, categoryId, userId, 99, "Excluded expense", true);
        var voided = Make(householdId, account.Id, categoryId, userId, 88, "Voided expense");
        voided.Void(userId, now);
        var mismatch = Make(householdId, usd.Id, categoryId, userId, 55, "USD expense");
        foreach (var row in new[] { rent, refund, excluded, voided, mismatch }) row.InitializeBudgetInclusion(false, userId);
        db.Accounts.AddRange(account, usd);
        db.Transactions.AddRange(rent, refund, excluded, voided, mismatch);
        await db.SaveChangesAsync();
        return new(account.Id, categoryId, rent.Id, refund.Id);
    }

    private static Transaction Make(Guid householdId, Guid accountId, Guid? categoryId, Guid userId,
        decimal amount, string description, bool excluded = false) => Transaction.CreateManual(
        householdId, accountId, categoryId, new DateOnly(2026, 7, 5), new DateOnly(2026, 7, 6),
        amount, description, "SECRET MERCHANT", "SECRET NOTES", excluded, userId, DateTimeOffset.UtcNow);
    private async Task AddMember(Guid householdId, Guid ownerId, Guid userId, HouseholdRole role)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var household = await db.Households.Include(h => h.Members).SingleAsync(h => h.Id == householdId);
        var member = household.AddInvitedMember(userId, role, ownerId, DateTimeOffset.UtcNow);
        db.HouseholdMembers.Add(member);
        await db.SaveChangesAsync();
    }
    private static async Task<TransactionListResult> List(HttpClient client, Guid householdId, string query = "") =>
        (await client.GetFromJsonAsync<TransactionListResult>($"/api/households/{householdId}/transactions?{query}"))!;
    private static async Task<TransactionListItem> Item(HttpClient client, Guid householdId, Guid id) =>
        (await List(client, householdId)).Items.Single(t => t.Id == id);
    private static async Task<AnnualBudgetOverviewModel> Annual(HttpClient client, Guid householdId, string scope) =>
        (await client.GetFromJsonAsync<AnnualBudgetOverviewModel>($"/api/households/{householdId}/annual-budget-overview/2026?scope={scope}"))!;
    private static async Task Change(HttpClient client, Guid householdId, Guid id, bool? household, bool personal)
    {
        var row = await Item(client, householdId, id);
        var response = await Put(client, $"/api/households/{householdId}/transactions/{id}/budget-inclusion",
            new { includeInHouseholdBudget = household, includeInPersonalBudget = personal, row.UpdatedAtUtc });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }
    private static Task<HttpResponseMessage> Put(HttpClient client, string path, object body) =>
        Send(client, HttpMethod.Put, path, JsonContent.Create(body));
    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, HttpContent body)
    {
        var token = (await client.GetFromJsonAsync<TokenResult>("/api/auth/antiforgery"))!.Token;
        var request = new HttpRequestMessage(method, path) { Content = body };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return await client.SendAsync(request);
    }
    private Task<Guid> Register(HttpClient client) =>
        TestIdentity.RegisterAndSignIn(client, $"budget-inclusion-{Guid.NewGuid():N}@example.test", displayName: "Test", confirmationHost: factory);
    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var result = await Send(client, HttpMethod.Post, "/api/households", JsonContent.Create(new {
            name = "Inclusion test", defaultCurrency = "CAD", timeZoneId = "America/Vancouver"
        }));
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        return (await result.Content.ReadFromJsonAsync<IdResult>())!.Id;
    }
    private sealed record TokenResult(string Token);
    private sealed record IdResult(Guid Id);
    private sealed record UploadResult(Guid ImportFileId);
    private sealed record SeedResult(Guid AccountId, Guid CategoryId, Guid RentId, Guid RefundId);
}
