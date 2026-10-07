using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.RecurringExpenses;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class HouseholdSettingsTests(BudgetAppWebApplicationFactory factory) : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task UnauthenticatedRequests_AreRejected()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Path(Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(client, Path(Guid.NewGuid()), new { })).StatusCode);
    }

    [Theory]
    [InlineData(HouseholdRole.Admin, true)]
    [InlineData(HouseholdRole.Editor, false)]
    [InlineData(HouseholdRole.Viewer, false)]
    public async Task MembersCanView_OnlyManagersCanWrite_IncludingCompatibilityEndpoint(HouseholdRole role, bool canEdit)
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var id = await Create(owner);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await WithDb(async db =>
        {
            var household = await db.Households.Include(item => item.Members).SingleAsync(item => item.Id == id);
            db.HouseholdMembers.Add(household.AddInvitedMember(memberId, role, ownerId, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        });
        var settings = await Read(member, id);
        Assert.Equal(canEdit, settings.CanEdit);
        var response = await Save(member, settings, name: "Renamed by member");
        Assert.Equal(canEdit ? HttpStatusCode.OK : HttpStatusCode.Forbidden, response.StatusCode);
        var legacy = await Send(member, $"/api/households/{id}/yearly-plans/default-start-month", new { fiscalYearStartMonth = 3 });
        Assert.Equal(canEdit ? HttpStatusCode.OK : HttpStatusCode.Forbidden, legacy.StatusCode);
        var after = await Read(owner, id);
        Assert.Equal(canEdit ? "Renamed by member" : settings.Name, after.Name);
        Assert.Equal(canEdit ? 3 : 1, after.FiscalYearStartMonth);
    }

    [Fact]
    public async Task OutsiderCannotReadOrWrite_AnotherHousehold()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        await Register(owner);
        var id = await Create(owner);
        var settings = await Read(owner, id);
        using var outsider = factory.CreateAuthenticatedTestClient();
        await Register(outsider);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(Path(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Save(outsider, settings, name: "Forged edit")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(outsider, $"/api/households/{id}/yearly-plans/default-start-month", new { fiscalYearStartMonth = 3 })).StatusCode);
        Assert.Equal(settings, await Read(owner, id));
    }

    [Fact]
    public async Task OwnerCanUpdateAllSettings_WhenUnused_AndRecordOneHouseholdEvent()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var settings = await Read(client, await Create(client));
        Assert.True(settings.CanChangeCurrency); // Default categories do not lock currency.
        var response = await Save(client, settings, name: "  New household  ", currency: "usd", zone: "America/Toronto", month: 3);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = (await response.Content.ReadFromJsonAsync<HouseholdSettingsModel>())!;
        Assert.Equal("New household", saved.Name);
        Assert.Equal("USD", saved.DefaultCurrency);
        Assert.Equal("America/Toronto", saved.TimeZoneId);
        Assert.Equal(3, saved.FiscalYearStartMonth);
        Assert.True(saved.Version > settings.Version);
        Assert.Equal(saved, await Read(client, settings.Id));
        var memberships = (await client.GetFromJsonAsync<Membership[]>("/api/households"))!;
        Assert.Contains(memberships, item => item.Id == settings.Id && item.Name == saved.Name && item.DefaultCurrency == "USD");
        await WithDb(async db =>
        {
            var audit = Assert.Single(await db.AuditEvents.Where(item => item.HouseholdId == settings.Id).ToListAsync());
            Assert.Equal(userId, audit.ActorUserId);
            Assert.Equal(AuditVisibility.Household, audit.Visibility);
            Assert.Contains("CAD", audit.DetailsJson);
            Assert.Contains("USD", audit.DetailsJson);
        });
    }

    [Theory]
    [InlineData("name", " ")]
    [InlineData("name", "too-long")]
    [InlineData("defaultCurrency", "ZZZ")]
    [InlineData("timeZoneId", "Not/A-Time-Zone")]
    [InlineData("fiscalYearStartMonth", "0")]
    [InlineData("fiscalYearStartMonth", "13")]
    [InlineData("version", "missing")]
    public async Task InvalidInputDoesNotChangeSettingsOrCreateActivity(string field, string value)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var settings = await Read(client, await Create(client));
        var body = Body(settings);
        body[field] = field == "fiscalYearStartMonth" ? int.Parse(value)
            : field == "version" ? null : value == "too-long" ? new string('a', 101) : value;
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(client, Path(settings.Id), body)).StatusCode);
        Assert.Equal(settings, await Read(client, settings.Id));
        await AssertEventCount(settings.Id, 0);
    }

    [Theory]
    [InlineData("account")]
    [InlineData("personal-account")]
    [InlineData("archived-account")]
    [InlineData("budget")]
    [InlineData("personal-budget")]
    [InlineData("annual-plan")]
    [InlineData("recurring")]
    [InlineData("import")]
    [InlineData("transaction")]
    public async Task FinancialDataLocksCurrency_EvenWhenAddedAfterSettingsWereLoaded(string kind)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var before = await Read(client, await Create(client));
        await SeedFinancial(before.Id, userId, kind);
        var locked = await Read(client, before.Id);
        Assert.False(locked.CanChangeCurrency);
        Assert.NotNull(locked.CurrencyLockedReason);
        Assert.Equal(before.Version, locked.Version);
        var attempt = await Save(client, before, name: "Must not partially save", currency: "USD", month: 3);
        Assert.Equal(HttpStatusCode.Conflict, attempt.StatusCode);
        Assert.Equal(locked, await Read(client, before.Id));
        await AssertEventCount(before.Id, 0);
        Assert.Equal(HttpStatusCode.OK, (await Save(client, locked, name: "Allowed rename", month: 3)).StatusCode);
        await AssertEventCount(before.Id, 1);
    }

    [Fact]
    public async Task StaleAndRepeatedWrites_DoNotOverwriteOrDuplicateActivity()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var before = await Read(client, await Create(client));
        Assert.Equal(HttpStatusCode.OK, (await Save(client, before, name: "First save")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, before, name: "First save")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, before, name: "Stale second tab")).StatusCode);
        Assert.Equal("First save", (await Read(client, before.Id)).Name);
        await AssertEventCount(before.Id, 1);
    }

    [Fact]
    public async Task CompatibilityWriteUsesSameConflictVersion_AndNoOpDoesNotCreateActivity()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var before = await Read(client, await Create(client));
        Assert.Equal(HttpStatusCode.OK, (await Save(client, before)).StatusCode);
        Assert.Equal(before.Version, (await Read(client, before.Id)).Version);
        await AssertEventCount(before.Id, 0);
        Assert.Equal(HttpStatusCode.OK, (await Send(client, $"/api/households/{before.Id}/yearly-plans/default-start-month", new { fiscalYearStartMonth = 3 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, before, name: "Stale form")).StatusCode);
        await AssertEventCount(before.Id, 1);
    }

    [Fact]
    public async Task DefaultChangesDoNotRewriteFinancialHistory_AndNewPlansUseNewDefault()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var id = await Create(client);
        await SeedFinancial(id, userId, "budget");
        await SeedFinancial(id, userId, "annual-plan");
        await SeedFinancial(id, userId, "transaction");
        var before = await FinancialSnapshot(id);
        var settings = await Read(client, id);
        Assert.Equal(HttpStatusCode.OK, (await Save(client, settings, name: "Updated name", zone: "UTC", month: 3)).StatusCode);
        Assert.Equal(before, await FinancialSnapshot(id));
        var existing = await client.GetFromJsonAsync<JsonElement>($"/api/households/{id}/yearly-plans/2026?scope=Household");
        Assert.Equal(1, existing.GetProperty("fiscalYearStartMonth").GetInt32());
        var unsaved = await client.GetFromJsonAsync<JsonElement>($"/api/households/{id}/yearly-plans/2027?scope=Household");
        Assert.Equal(3, unsaved.GetProperty("fiscalYearStartMonth").GetInt32());
    }

    [Fact]
    public async Task EditorCanStillEditPlanStartMonth_ButNotHouseholdDefault()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var id = await Create(owner);
        using var editor = factory.CreateAuthenticatedTestClient();
        var editorId = await Register(editor);
        await WithDb(async db =>
        {
            var household = await db.Households.Include(item => item.Members).SingleAsync(item => item.Id == id);
            db.HouseholdMembers.Add(household.AddInvitedMember(editorId, HouseholdRole.Editor, ownerId, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.OK, (await Send(editor, $"/api/households/{id}/yearly-plans/2027",
            new { scope = "Household", fiscalYearStartMonth = 4, lines = Array.Empty<object>() })).StatusCode);
        Assert.Equal(1, (await Read(editor, id)).FiscalYearStartMonth);
    }

    [Fact]
    public async Task SaveRequiresAntiforgery()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var settings = await Read(client, await Create(client));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(Path(settings.Id), Body(settings))).StatusCode);
        await AssertEventCount(settings.Id, 0);
    }

    private async Task SeedFinancial(Guid id, Guid userId, string kind) => await WithDb(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var categoryId = await db.Categories.Where(item => item.HouseholdId == id && item.ParentCategoryId != null).Select(item => item.Id).FirstAsync();
        switch (kind)
        {
            case "budget": db.BudgetMonths.Add(BudgetMonth.CreateHousehold(id, 2026, 1, "CAD", now)); break;
            case "personal-budget": db.BudgetMonths.Add(BudgetMonth.CreatePersonal(id, userId, 2026, 1, "CAD", now)); break;
            case "annual-plan": db.YearlyPlans.Add(YearlyPlan.CreateHousehold(id, 2026, 1, "CAD", now)); break;
            case "recurring": db.RecurringExpenses.Add(RecurringExpense.CreateHousehold(id, "Test expense", 10, "CAD", categoryId, null, 1, new(2026, 1, 1), null, now)); break;
            default:
                var account = kind == "personal-account"
                    ? Account.CreatePersonal(id, userId, "Private account", AccountType.Chequing, "CAD", null, null, now)
                    : Account.CreateHousehold(id, "Sample account", AccountType.Chequing, "CAD", null, null, now);
                if (kind == "archived-account") account.Archive(now);
                db.Accounts.Add(account);
                if (kind == "import") db.ImportFiles.Add(ImportFile.Create(id, account.Id, userId, "sample.csv", 10, new string('a', 64), now));
                if (kind == "transaction") db.Transactions.Add(Transaction.CreateManual(id, account.Id, categoryId, new(2026, 1, 15), null, 10, "Sample transaction", null, null, false, userId, now));
                break;
        }
        await db.SaveChangesAsync();
    });

    private async Task<string> FinancialSnapshot(Guid id)
    {
        string snapshot = "";
        await WithDb(async db => { snapshot = JsonSerializer.Serialize(new {
            budgets = await db.BudgetMonths.Where(item => item.HouseholdId == id).ToListAsync(),
            plans = await db.YearlyPlans.Where(item => item.HouseholdId == id).ToListAsync(),
            transactions = await db.Transactions.Where(item => item.HouseholdId == id).ToListAsync()
        }); });
        return snapshot;
    }
    private async Task AssertEventCount(Guid id, int count) => await WithDb(async db =>
        Assert.Equal(count, await db.AuditEvents.CountAsync(item => item.HouseholdId == id)));
    private async Task WithDb(Func<BudgetAppDbContext, Task> action)
    {
        using var scope = factory.Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>());
    }
    private static string Path(Guid id) => $"/api/households/{id}/settings";
    private static async Task<HouseholdSettingsModel> Read(HttpClient client, Guid id) => (await client.GetFromJsonAsync<HouseholdSettingsModel>(Path(id)))!;
    private static Dictionary<string, object?> Body(HouseholdSettingsModel data) => new() {
        ["name"] = data.Name, ["defaultCurrency"] = data.DefaultCurrency, ["timeZoneId"] = data.TimeZoneId,
        ["fiscalYearStartMonth"] = data.FiscalYearStartMonth, ["version"] = data.Version };
    private static Task<HttpResponseMessage> Save(HttpClient client, HouseholdSettingsModel data,
        string? name = null, string? currency = null, string? zone = null, int? month = null)
    {
        var body = Body(data);
        body["name"] = name ?? data.Name; body["defaultCurrency"] = currency ?? data.DefaultCurrency;
        body["timeZoneId"] = zone ?? data.TimeZoneId; body["fiscalYearStartMonth"] = month ?? data.FiscalYearStartMonth;
        return Send(client, Path(data.Id), body);
    }
    private static async Task<HttpResponseMessage> Send(HttpClient client, string path, object body, HttpMethod? method = null)
    {
        var token = (await client.GetFromJsonAsync<Token>("/api/auth/antiforgery"))!.Value;
        using var request = new HttpRequestMessage(method ?? HttpMethod.Put, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return await client.SendAsync(request);
    }
    private Task<Guid> Register(HttpClient client) =>
        TestIdentity.RegisterAndSignIn(client, $"settings-{Guid.NewGuid():N}@example.test", displayName: "Settings Test", confirmationHost: factory);
    private static async Task<Guid> Create(HttpClient client)
    {
        var response = await Send(client, "/api/households", new { name = "Settings household", defaultCurrency = "CAD", timeZoneId = "America/Vancouver" }, HttpMethod.Post);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Membership>())!.Id;
    }
    private sealed record Membership(Guid Id, string Name, string DefaultCurrency);
    private sealed record Token([property: System.Text.Json.Serialization.JsonPropertyName("token")] string Value);
}
