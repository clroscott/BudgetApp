using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class SavedTransactionFilterTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    private static SavedTransactionFilterDefinition Filters() => new("", "pastDays", "30", "", "", "", "", "", "", "", "", "", "", false);
    private static string Path(Guid household, Guid? id = null) => $"/api/households/{household}/transaction-filters" + (id.HasValue ? $"/{id}" : "");

    [Fact]
    public async Task PrivateCrud_RetryDoesNotDuplicate_AndNeverChangesFinancialDataOrActivity()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var household = await CreateHousehold(client);
        var id = Guid.NewGuid();
        var filters = Filters() with { Currency = "cad", BudgetInclusion = "Personal", SpendingOnly = true, Description = " rent " };
        var created = await Save(client, household, id, " Rent ", filters);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var preset = (await created.Content.ReadFromJsonAsync<SavedTransactionFilterModel>())!;
        Assert.Equal("Rent", preset.Name);
        Assert.Equal("CAD", preset.Filters.Currency);
        Assert.Equal("rent", preset.Filters.Description);
        Assert.Equal("pastDays", preset.Filters.DateMode);
        Assert.Equal("", preset.Filters.FromDate);
        Assert.Equal(HttpStatusCode.OK, (await Save(client, household, id, "Rent", filters)).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(household)))!);
        var renamed = await Send(client, HttpMethod.Put, Path(household, id) + "/name", new { name = "Rent history", version = preset.Version });
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        var latest = (await renamed.Content.ReadFromJsonAsync<SavedTransactionFilterModel>())!;
        Assert.NotEqual(preset.Version, latest.Version);
        Assert.Equal(HttpStatusCode.OK, (await Send(client, HttpMethod.Put, Path(household, id) + "/name", new { name = latest.Name, version = preset.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Delete(client, household, latest)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Delete(client, household, latest)).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(household)))!);
        await WithDb(async db => {
            Assert.Equal(0, await db.Transactions.CountAsync(item => item.HouseholdId == household));
            Assert.Equal(0, await db.BudgetMonths.CountAsync(item => item.HouseholdId == household));
            Assert.Equal(0, await db.AuditEvents.CountAsync(item => item.HouseholdId == household));
        });
    }

    [Fact]
    public async Task SameHouseholdViewerHasOwnPresets_NotOwnersPrivatePresets()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var household = await CreateHousehold(owner);
        using var viewer = factory.CreateAuthenticatedTestClient();
        var viewerId = await Register(viewer);
        await AddMember(household, ownerId, viewerId);
        var id = Guid.NewGuid();
        var created = await Save(owner, household, id, "My private rent", Filters());
        var own = (await created.Content.ReadFromJsonAsync<SavedTransactionFilterModel>())!;
        Assert.Empty((await viewer.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(household)))!);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync(Path(household, id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(viewer, HttpMethod.Put, Path(household, id) + "/name", new { name = "Intruder", version = own.Version })).StatusCode);
        // Idempotent delete of an invisible ID reveals nothing and must not delete the owner's record.
        Assert.Equal(HttpStatusCode.OK, (await Delete(viewer, household, own)).StatusCode);
        Assert.Single((await owner.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(household)))!);
        Assert.Equal(HttpStatusCode.OK, (await Save(viewer, household, Guid.NewGuid(), "My private rent", Filters())).StatusCode);
        Assert.Single((await viewer.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(household)))!);
    }

    [Fact]
    public async Task DifferentHouseholdAndNonMembersCannotReadOrChangePresets()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        await Register(owner);
        var first = await CreateHousehold(owner);
        var second = await CreateHousehold(owner);
        var id = Guid.NewGuid();
        await Save(owner, first, id, "First only", Filters());
        Assert.Empty((await owner.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(second)))!);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(Path(second, id))).StatusCode);
        using var stranger = factory.CreateAuthenticatedTestClient();
        await Register(stranger);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync(Path(first))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Save(stranger, first, Guid.NewGuid(), "Intruder", Filters())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(stranger, HttpMethod.Put, Path(first, id) + "/name", new { name = "Intruder", version = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(stranger, HttpMethod.Delete, Path(first, id) + "?version=" + Guid.NewGuid(), new { })).StatusCode);
    }

    [Fact]
    public async Task DuplicateNamesAndStaleChangesAreRejected()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var household = await CreateHousehold(client);
        var id = Guid.NewGuid();
        var first = (await (await Save(client, household, id, "Rent", Filters())).Content.ReadFromJsonAsync<SavedTransactionFilterModel>())!;
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, household, Guid.NewGuid(), " rent ", Filters())).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, household, id, "Different request", Filters())).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(client, HttpMethod.Put, Path(household, id) + "/name", new { name = "Other", version = Guid.NewGuid() })).StatusCode);
        var renamed = (await (await Send(client, HttpMethod.Put, Path(household, id) + "/name", new { name = "Other", version = first.Version })).Content.ReadFromJsonAsync<SavedTransactionFilterModel>())!;
        Assert.Equal(HttpStatusCode.Conflict, (await Delete(client, household, first)).StatusCode);
        Assert.Equal("Other", (await client.GetFromJsonAsync<SavedTransactionFilterModel>(Path(household, id)))!.Name);
        await Save(client, household, Guid.NewGuid(), "Taken", Filters());
        Assert.Equal(HttpStatusCode.Conflict, (await Send(client, HttpMethod.Put, Path(household, id) + "/name", new { name = "taken", version = renamed.Version })).StatusCode);
    }

    [Fact]
    public async Task LeavingHouseholdRevokesEveryPresetOperation_WithoutDeletingPreferences()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var household = await CreateHousehold(owner);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(household, ownerId, memberId);
        var id = Guid.NewGuid();
        var saved = (await (await Save(member, household, id, "Former member", Filters())).Content.ReadFromJsonAsync<SavedTransactionFilterModel>())!;
        Assert.Equal(HttpStatusCode.NoContent, (await TestIdentity.Post(member, $"/api/households/{household}/leave", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync(Path(household))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync(Path(household, id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Save(member, household, Guid.NewGuid(), "Other", Filters())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(member, HttpMethod.Put, Path(household, id) + "/name", new { name = "Other", version = saved.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Delete(member, household, saved)).StatusCode);
        await WithDb(async db => Assert.True(await db.SavedTransactionFilters.AnyAsync(item => item.Id == id)));
    }

    [Fact]
    public async Task DeletingAnUnusedHouseholdCascadesOnlyItsPresets()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var first = await CreateHousehold(client);
        var second = await CreateHousehold(client);
        await Save(client, first, Guid.NewGuid(), "First", Filters());
        await Save(client, second, Guid.NewGuid(), "Second", Filters());
        Assert.Equal(HttpStatusCode.NoContent, (await Send(client, HttpMethod.Delete, $"/api/households/{first}/unused", new { })).StatusCode);
        await WithDb(async db => Assert.False(await db.SavedTransactionFilters.AnyAsync(item => item.HouseholdId == first)));
        Assert.Single((await client.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(second)))!);
    }

    [Fact]
    public async Task UnavailableReferencesAreExplainedWithoutLeakingPrivateAccountNames()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var user = await Register(client);
        var household = await CreateHousehold(client);
        Guid accountId = Guid.Empty, categoryId = Guid.Empty;
        await WithDb(async db => {
            var account = Account.CreateHousehold(household, "Historical account", AccountType.Chequing, "CAD", null, null, DateTimeOffset.UtcNow);
            account.Archive(DateTimeOffset.UtcNow);
            var category = Category.CreateRoot(household, "Historical category", CategoryType.Expense, 100, DateTimeOffset.UtcNow);
            category.Deactivate(DateTimeOffset.UtcNow);
            db.Accounts.Add(account); db.Categories.Add(category);
            accountId = account.Id; categoryId = category.Id;
            await db.SaveChangesAsync();
        });
        var id = Guid.NewGuid();
        var saved = await Save(client, household, id, "Historical", Filters() with { AccountId = accountId.ToString(), CategoryId = categoryId.ToString(), CategoryType = "Expense" });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<SavedTransactionFilterModel>(Path(household, id)))!.UnavailableReferences);
        await WithDb(async db => {
            db.Accounts.Remove(await db.Accounts.SingleAsync(item => item.Id == accountId));
            db.Categories.Remove(await db.Categories.SingleAsync(item => item.Id == categoryId));
            await db.SaveChangesAsync();
        });
        var missing = (await client.GetFromJsonAsync<SavedTransactionFilterModel>(Path(household, id)))!;
        Assert.Equal(2, missing.UnavailableReferences.Count);
        Assert.Equal(accountId.ToString(), missing.Filters.AccountId);
        Assert.Equal(categoryId.ToString(), missing.Filters.CategoryId);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(client, household, Guid.NewGuid(), "Missing", Filters() with { AccountId = accountId.ToString() })).StatusCode);
        using var other = factory.CreateAuthenticatedTestClient();
        var otherId = await Register(other);
        await AddMember(household, user, otherId);
        Guid privateId = Guid.Empty;
        await WithDb(async db => {
            var account = Account.CreatePersonal(household, otherId, "SECRET ACCOUNT NAME", AccountType.Savings, "CAD", null, null, DateTimeOffset.UtcNow);
            privateId = account.Id; db.Accounts.Add(account); await db.SaveChangesAsync();
        });
        var rejected = await Save(client, household, Guid.NewGuid(), "Secret", Filters() with { AccountId = privateId.ToString() });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.DoesNotContain("SECRET ACCOUNT NAME", await rejected.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("days")]
    [InlineData("date")]
    [InlineData("month")]
    [InlineData("range")]
    [InlineData("mode")]
    [InlineData("currency")]
    [InlineData("inclusion")]
    [InlineData("id")]
    public async Task InvalidDefinitionIsRejected(string kind)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var household = await CreateHousehold(client);
        var invalid = kind switch {
            "days" => Filters() with { PastDays = "0" },
            "date" => Filters() with { DateMode = "specificDate", SpecificDate = "2026-02-30" },
            "month" => Filters() with { DateMode = "specificMonth", SpecificMonth = "2026-13" },
            "range" => Filters() with { DateMode = "range", FromDate = "2026-12-01", ToDate = "2026-01-01" },
            "mode" => Filters() with { DateMode = "unexpected" },
            "currency" => Filters() with { Currency = "XXX" },
            "inclusion" => Filters() with { BudgetInclusion = "Other user's personal budget" },
            _ => Filters() with { AccountId = "not-a-guid" }
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(client, household, Guid.NewGuid(), "Invalid", invalid)).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<SavedTransactionFilterModel[]>(Path(household)))!);
    }

    [Fact]
    public async Task UnauthenticatedUnverifiedAndMissingAntiforgeryAreBlocked()
    {
        using var anonymous = factory.CreateAuthenticatedTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Path(Guid.NewGuid()))).StatusCode);
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var household = await CreateHousehold(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(Path(household, Guid.NewGuid()), new { name = "No CSRF", filters = Filters() })).StatusCode);
        using var unverified = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(unverified);
        Assert.Equal(HttpStatusCode.Forbidden, (await unverified.GetAsync(Path(household))).StatusCode);
    }

    private Task<Guid> Register(HttpClient client) => TestIdentity.RegisterAndSignIn(client, confirmationHost: factory);
    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, object body)
    {
        var csrf = (await client.GetFromJsonAsync<Token>("/api/auth/antiforgery"))!;
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-XSRF-TOKEN", csrf.Value);
        return await client.SendAsync(request);
    }
    private static Task<HttpResponseMessage> Save(HttpClient client, Guid household, Guid id, string name, SavedTransactionFilterDefinition filters) =>
        Send(client, HttpMethod.Put, Path(household, id), new { name, filters });
    private static Task<HttpResponseMessage> Delete(HttpClient client, Guid household, SavedTransactionFilterModel filter) =>
        Send(client, HttpMethod.Delete, Path(household, filter.Id) + "?version=" + filter.Version, new { });
    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var result = await Send(client, HttpMethod.Post, "/api/households", new { name = "Filter household", defaultCurrency = "CAD", timeZoneId = "America/Vancouver" });
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        return (await result.Content.ReadFromJsonAsync<Created>())!.Id;
    }
    private Task AddMember(Guid householdId, Guid owner, Guid member) => WithDb(async db => {
        var household = await db.Households.Include(item => item.Members).SingleAsync(item => item.Id == householdId);
        db.HouseholdMembers.Add(household.AddInvitedMember(member, HouseholdRole.Viewer, owner, DateTimeOffset.UtcNow));
        await db.SaveChangesAsync();
    });
    private async Task WithDb(Func<BudgetAppDbContext, Task> action)
    {
        using var scope = factory.Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>());
    }
    private sealed record Token([property: System.Text.Json.Serialization.JsonPropertyName("token")] string Value);
    private sealed record Created(Guid Id);
}
