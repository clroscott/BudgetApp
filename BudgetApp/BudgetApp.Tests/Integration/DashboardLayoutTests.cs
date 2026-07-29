using System.Net;
using System.Net.Http.Json;

namespace BudgetApp.Tests.Integration;

public sealed class DashboardLayoutTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task User_CanSaveAndResetPersonalDashboardLayout()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var path = $"/api/households/{householdId}/dashboard-layout";

        var defaults = await client.GetFromJsonAsync<DashboardLayoutResponse>(path);
        Assert.NotNull(defaults);
        Assert.True(defaults.IsDefault);
        Assert.Equal(3, defaults.PreferredColumnCount);
        Assert.Equal("monthly-budget", defaults.VisiblePanelKeys[0]);

        var save = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            path,
            new
            {
                preferredColumnCount = 4,
                visiblePanelKeys = new[] { "transactions", "accounts" }
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        var saved = await client.GetFromJsonAsync<DashboardLayoutResponse>(path);
        Assert.NotNull(saved);
        Assert.False(saved.IsDefault);
        Assert.Equal(4, saved.PreferredColumnCount);
        Assert.Equal(["transactions", "accounts"], saved.VisiblePanelKeys);

        var reorder = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            path,
            new
            {
                preferredColumnCount = 2,
                visiblePanelKeys = new[] { "accounts", "categories" }
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, reorder.StatusCode);
        var reordered = await client.GetFromJsonAsync<DashboardLayoutResponse>(path);
        Assert.Equal(
            ["accounts", "categories"],
            reordered!.VisiblePanelKeys);

        var reset = await SendWithAntiforgery(
            client,
            HttpMethod.Delete,
            path,
            new { },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        var restored = await client.GetFromJsonAsync<DashboardLayoutResponse>(path);
        Assert.NotNull(restored);
        Assert.True(restored.IsDefault);
        Assert.Equal(3, restored.PreferredColumnCount);
        Assert.Contains("household", restored.VisiblePanelKeys);
    }

    [Fact]
    public async Task Save_WithInvalidPanelIdentifier_IsRejected()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);

        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/households/{householdId}/dashboard-layout",
            new
            {
                preferredColumnCount = 3,
                visiblePanelKeys = new[] { "unknown panel!" }
            },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Save_WithNewWellFormedPanelIdentifier_IsAccepted()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);

        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/households/{householdId}/dashboard-layout",
            new
            {
                preferredColumnCount = 3,
                visiblePanelKeys = new[] { "future-forecast-page" }
            },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved =
            await response.Content.ReadFromJsonAsync<DashboardLayoutResponse>();
        Assert.Equal(["future-forecast-page"], saved!.VisiblePanelKeys);
    }

    private static async Task Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"dashboard-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Dashboard Test"
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
                name = "Dashboard Household",
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
    private sealed record DashboardLayoutResponse(
        int PreferredColumnCount,
        string[] VisiblePanelKeys,
        bool IsDefault);
}
