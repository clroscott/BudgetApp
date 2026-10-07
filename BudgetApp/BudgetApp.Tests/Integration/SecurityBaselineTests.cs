using System.Net;
using System.Net.Http.Json;

namespace BudgetApp.Tests.Integration;

public sealed class SecurityBaselineTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    private static readonly Guid HouseholdId = Guid.NewGuid();

    [Fact]
    public async Task Responses_IncludeBrowserSecurityHeaders_AndApiIsNotCached()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await client.GetAsync("/api/health");

        response.EnsureSuccessStatusCode();
        Assert.Equal(
            "nosniff",
            Assert.Single(response.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal(
            "DENY",
            Assert.Single(response.Headers.GetValues("X-Frame-Options")));
        Assert.Equal(
            "no-referrer",
            Assert.Single(response.Headers.GetValues("Referrer-Policy")));
        Assert.Contains(
            "frame-ancestors 'none'",
            Assert.Single(response.Headers.GetValues("Content-Security-Policy")),
            StringComparison.Ordinal);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task AuthenticationCookie_HasSecureHostOnlyAttributes()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var token = await GetAntiforgeryToken(client);
        var email = $"security-{Guid.NewGuid():N}@example.test";

        var registration = await Send(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email,
                password = "a long test password",
                displayName = "Security Test"
            },
            token);

        registration.EnsureSuccessStatusCode();
        var response = await TestIdentity.Post(client, "/api/auth/login", new { email, password = TestIdentity.Password });
        response.EnsureSuccessStatusCode();
        var cookie = Assert.Single(
            response.Headers.GetValues("Set-Cookie"),
            value => value.StartsWith(
                "__Host-BudgetApp.Auth=",
                StringComparison.Ordinal));
        Assert.Contains("path=/", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AuthenticatedMutation_WithoutAntiforgeryHeader_IsRejected()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var response = await client.PostAsJsonAsync(
            "/api/households",
            new
            {
                name = "Should not be created",
                defaultCurrency = "CAD",
                timeZoneId = "UTC"
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(ProtectedGetEndpoints))]
    public async Task ProtectedApiSurface_RejectsAnonymousRequests(string path)
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    public static TheoryData<string> ProtectedGetEndpoints => new()
    {
        "/api/auth/me",
        "/api/households",
        $"/api/households/{HouseholdId}/accounts",
        $"/api/households/{HouseholdId}/annual-budget-overview/2026?scope=Household",
        $"/api/households/{HouseholdId}/audit-events",
        $"/api/households/{HouseholdId}/budgets",
        $"/api/households/{HouseholdId}/categories",
        $"/api/households/{HouseholdId}/categorization-rules",
        $"/api/households/{HouseholdId}/dashboard-layout",
        $"/api/households/{HouseholdId}/import-profiles",
        $"/api/households/{HouseholdId}/imports",
        $"/api/households/{HouseholdId}/members",
        $"/api/households/{HouseholdId}/settings",
        $"/api/households/{HouseholdId}/recurring-expenses",
        $"/api/households/{HouseholdId}/transactions",
        $"/api/households/{HouseholdId}/yearly-plans/2026?scope=Household",
        "/api/household-invitations/pending",
        "/api/tutorial-progress"
    };

    private Task Register(HttpClient client) =>
        TestIdentity.RegisterAndSignIn(client, $"security-{Guid.NewGuid():N}@example.test", displayName: "Security Test", confirmationHost: factory);

    private static async Task<string> GetAntiforgeryToken(HttpClient client)
    {
        var response = await client.GetFromJsonAsync<AntiforgeryResponse>(
            "/api/auth/antiforgery");
        return response?.Token ?? throw new InvalidOperationException(
            "The antiforgery endpoint did not return a token.");
    }

    private static Task<HttpResponseMessage> Send<T>(
        HttpClient client,
        HttpMethod method,
        string path,
        T body,
        string antiforgeryToken)
    {
        var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", antiforgeryToken);
        return client.SendAsync(request);
    }

    private sealed record AntiforgeryResponse(string Token);
}
