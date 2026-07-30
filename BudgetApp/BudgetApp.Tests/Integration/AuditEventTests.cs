using System.Net;
using System.Net.Http.Json;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class AuditEventTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task List_WithoutAuthentication_ReturnsUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await client.GetAsync(Path(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task List_WithoutHouseholdMembership_ReturnsForbidden()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var response = await client.GetAsync(Path(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task List_ReturnsHouseholdAndOwnPersonalEventsOnly()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        var seeded = await SeedEvents(householdId, userId);

        var result = await client.GetFromJsonAsync<AuditListResponse>(
            Path(householdId));

        Assert.NotNull(result);
        Assert.Equal(2, result.TotalCount);
        Assert.Contains(result.Items, item => item.Id == seeded.HouseholdEventId);
        Assert.Contains(result.Items, item => item.Id == seeded.OwnPersonalEventId);
        Assert.DoesNotContain(
            result.Items,
            item => item.Id == seeded.OtherPersonalEventId);
        Assert.Contains(result.Items, item =>
            item.Visibility == "Personal" &&
            item.Summary == "Updated my private transaction.");
        Assert.Contains("Updated", result.Filters.Actions);
        Assert.Contains("Budget", result.Filters.EntityTypes);
    }

    [Fact]
    public async Task List_AppliesDateActorActionAndEntityFilters()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        await SeedEvents(householdId, userId);

        var result = await client.GetFromJsonAsync<AuditListResponse>(
            Path(householdId) +
            $"?fromDate=2026-07-29&toDate=2026-07-29" +
            $"&actorUserId={userId}&action=Updated&entityType=Budget&page=1");

        Assert.NotNull(result);
        var auditEvent = Assert.Single(result.Items);
        Assert.Equal("Updated the household budget.", auditEvent.Summary);
    }

    [Fact]
    public async Task SuccessfulOperationCreatesEvent_FailedOperationDoesNot()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var accountsPath = $"/api/households/{householdId}/accounts";

        var created = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            accountsPath,
            new
            {
                name = "Audited Chequing",
                type = "Chequing",
                scope = "Household",
                currency = "CAD",
                institutionName = (string?)null,
                lastFourDigits = (string?)null
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var rejected = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            accountsPath,
            new
            {
                name = "Rejected Account",
                type = "Unsupported",
                scope = "Household",
                currency = "CAD",
                institutionName = (string?)null,
                lastFourDigits = (string?)null
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var auditEvent = Assert.Single(dbContext.AuditEvents.Where(entry =>
            entry.HouseholdId == householdId));
        Assert.Equal("Created", auditEvent.Action);
        Assert.Contains("Audited Chequing", auditEvent.Summary);
        Assert.DoesNotContain("Rejected Account", auditEvent.Summary);
    }

    private async Task<SeededEvents> SeedEvents(
        Guid householdId,
        Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var otherUserId = Guid.NewGuid();
        dbContext.Users.Add(new ApplicationUser
        {
            Id = otherUserId,
            DisplayName = "Other Audit User",
            Email = $"other-audit-{otherUserId:N}@example.test",
            NormalizedEmail = $"OTHER-AUDIT-{otherUserId:N}@EXAMPLE.TEST",
            UserName = $"other-audit-{otherUserId:N}@example.test",
            NormalizedUserName = $"OTHER-AUDIT-{otherUserId:N}@EXAMPLE.TEST"
        });
        var otherHousehold = Household.Create(
            "Other Audit Household",
            "CAD",
            "America/Vancouver",
            userId,
            DateTimeOffset.UtcNow);
        dbContext.Households.Add(otherHousehold);

        var householdEvent = AuditEvent.Create(
            householdId,
            userId,
            AuditVisibility.Household,
            null,
            new DateTimeOffset(2026, 7, 29, 12, 0, 0, TimeSpan.Zero),
            "Updated",
            "Budget",
            Guid.NewGuid(),
            "Updated the household budget.",
            """{"Groceries":"500.00 → 600.00"}""");
        var ownPersonalEvent = AuditEvent.Create(
            householdId,
            userId,
            AuditVisibility.Personal,
            userId,
            new DateTimeOffset(2026, 7, 28, 12, 0, 0, TimeSpan.Zero),
            "Updated",
            "Transaction",
            Guid.NewGuid(),
            "Updated my private transaction.");
        var otherPersonalEvent = AuditEvent.Create(
            householdId,
            otherUserId,
            AuditVisibility.Personal,
            otherUserId,
            new DateTimeOffset(2026, 7, 29, 13, 0, 0, TimeSpan.Zero),
            "Updated",
            "Transaction",
            Guid.NewGuid(),
            "Updated another private transaction.");
        var otherHouseholdEvent = AuditEvent.Create(
            otherHousehold.Id,
            userId,
            AuditVisibility.Personal,
            userId,
            new DateTimeOffset(2026, 7, 29, 14, 0, 0, TimeSpan.Zero),
            "Updated",
            "Transaction",
            Guid.NewGuid(),
            "Updated a transaction in another household.");
        dbContext.AuditEvents.AddRange(
            householdEvent,
            ownPersonalEvent,
            otherPersonalEvent,
            otherHouseholdEvent);
        await dbContext.SaveChangesAsync();

        return new SeededEvents(
            householdEvent.Id,
            ownPersonalEvent.Id,
            otherPersonalEvent.Id);
    }

    private static string Path(Guid householdId) =>
        $"/api/households/{householdId}/audit-events";

    private static async Task<Guid> Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"audit-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Audit Test User"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var currentUser = await client.GetFromJsonAsync<CurrentUserResponse>(
            "/api/auth/me");
        return currentUser?.Id
            ?? throw new InvalidOperationException("Current user ID was missing.");
    }

    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/households",
            new
            {
                name = "Audit Test Household",
                defaultCurrency = "CAD",
                timeZoneId = "America/Vancouver"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<HouseholdResponse>();
        return created?.Id
            ?? throw new InvalidOperationException("Household ID was missing.");
    }

    private static async Task<string> GetAntiforgeryToken(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/antiforgery");
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<TokenResponse>();
        return result?.Token
            ?? throw new InvalidOperationException("Antiforgery token was missing.");
    }

    private static Task<HttpResponseMessage> SendWithAntiforgery<TRequest>(
        HttpClient client,
        HttpMethod method,
        string requestUri,
        TRequest body,
        string token)
    {
        var request = new HttpRequestMessage(method, requestUri)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return client.SendAsync(request);
    }

    private sealed record TokenResponse(string Token);
    private sealed record CurrentUserResponse(Guid Id);
    private sealed record HouseholdResponse(Guid Id);
    private sealed record SeededEvents(
        Guid HouseholdEventId,
        Guid OwnPersonalEventId,
        Guid OtherPersonalEventId);
    private sealed record AuditListResponse(
        IReadOnlyList<AuditItemResponse> Items,
        int TotalCount,
        AuditFilterResponse Filters);
    private sealed record AuditItemResponse(
        Guid Id,
        string Visibility,
        string Summary);
    private sealed record AuditFilterResponse(
        IReadOnlyList<string> Actions,
        IReadOnlyList<string> EntityTypes);
}
