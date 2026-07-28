using System.Net;
using System.Net.Http.Json;

namespace BudgetApp.Tests.Integration;

public sealed class RecurringExpenseManagementTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Owner_CanManageRecurringExpenseLifecycle()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var categories = await client.GetFromJsonAsync<CategoryResponse[]>(
            $"/api/households/{householdId}/categories") ?? [];
        var subscriptions = Assert.Single(
            categories, category => category.Name == "Subscriptions");
        var streaming = Assert.Single(
            subscriptions.Children, category => category.Name == "Streaming");
        var path = $"/api/households/{householdId}/recurring-expenses";

        var create = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            path,
            new
            {
                name = "Netflix",
                amount = 22.99m,
                scope = "Personal",
                budgetMode = "Detailed",
                subcategoryId = streaming.Id,
                accountId = (Guid?)null,
                expectedDayOfMonth = 15,
                startsOn = "2026-01-01",
                endsOn = (string?)null
            },
            token);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<CreateResponse>();

        var items = await client.GetFromJsonAsync<RecurringExpenseResponse[]>(path) ?? [];
        var netflix = Assert.Single(items, item => item.Id == created!.Id);
        Assert.Equal("Subscriptions", netflix.CategoryName);
        Assert.Equal("Streaming", netflix.SubcategoryName);
        Assert.Equal(22.99m, netflix.Amount);
        Assert.Equal("Detailed", netflix.BudgetMode);
        Assert.True(netflix.IsActive);

        var update = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"{path}/{netflix.Id}",
            new
            {
                name = "Netflix Premium",
                amount = 25.99m,
                scope = "Personal",
                budgetMode = "Overall",
                subcategoryId = streaming.Id,
                accountId = (Guid?)null,
                expectedDayOfMonth = 16,
                startsOn = "2026-01-01",
                endsOn = (string?)null
            },
            token);
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);

        var deactivate = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"{path}/{netflix.Id}/deactivate",
            new { },
            token);
        Assert.Equal(HttpStatusCode.NoContent, deactivate.StatusCode);

        var updated = Assert.Single(
            await client.GetFromJsonAsync<RecurringExpenseResponse[]>(path) ?? [],
            item => item.Id == netflix.Id);
        Assert.Equal("Netflix Premium", updated.Name);
        Assert.Equal(25.99m, updated.Amount);
        Assert.Equal("Overall", updated.BudgetMode);
        Assert.False(updated.IsActive);
    }

    [Fact]
    public async Task Create_WithRootCategory_IsRejected()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var categories = await client.GetFromJsonAsync<CategoryResponse[]>(
            $"/api/households/{householdId}/categories") ?? [];
        var subscriptions = Assert.Single(
            categories, category => category.Name == "Subscriptions");

        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"/api/households/{householdId}/recurring-expenses",
            new
            {
                name = "Invalid root item",
                amount = 10m,
                scope = "Household",
                subcategoryId = subscriptions.Id,
                expectedDayOfMonth = (int?)null,
                startsOn = "2026-01-01",
                endsOn = (string?)null
            },
            token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static async Task Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"recurring-api-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Recurring API Test"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/households",
            new
            {
                name = "Recurring API Household",
                defaultCurrency = "CAD",
                timeZoneId = "America/Vancouver"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CreateResponse>())!.Id;
    }

    private static async Task<string> GetAntiforgeryToken(HttpClient client) =>
        (await (await client.GetAsync("/api/auth/antiforgery"))
            .Content.ReadFromJsonAsync<AntiforgeryResponse>())!.Token;

    private static Task<HttpResponseMessage> SendWithAntiforgery<T>(
        HttpClient client,
        HttpMethod method,
        string path,
        T body,
        string token)
    {
        var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return client.SendAsync(request);
    }

    private sealed record AntiforgeryResponse(string Token);
    private sealed record CreateResponse(Guid Id);
    private sealed record CategoryResponse(
        Guid Id,
        string Name,
        IReadOnlyList<CategoryResponse> Children);
    private sealed record RecurringExpenseResponse(
        Guid Id,
        string Name,
        decimal Amount,
        string CategoryName,
        string SubcategoryName,
        string BudgetMode,
        bool IsActive);
}
