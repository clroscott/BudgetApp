using System.Net;
using System.Net.Http.Json;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class HouseholdOnboardingTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Households_WithoutAuthentication_ReturnUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var getResponse = await client.GetAsync("/api/households");
        var postResponse = await PostWithAntiforgeryToken(
            client,
            "/api/households",
            CreateHouseholdRequest(),
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Unauthorized, getResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, postResponse.StatusCode);
    }

    [Fact]
    public async Task CreateInitialHousehold_CreatesOwnerMembership()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var emptyResponse = await client.GetFromJsonAsync<HouseholdResponse[]>(
            "/api/households");
        Assert.Empty(emptyResponse ?? []);

        var createResponse = await PostWithAntiforgeryToken(
            client,
            "/api/households",
            CreateHouseholdRequest(),
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<HouseholdResponse>();
        Assert.NotNull(created);
        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.Equal("Scott Household", created.Name);
        Assert.Equal("CAD", created.DefaultCurrency);
        Assert.Equal("America/Vancouver", created.TimeZoneId);
        Assert.Equal("Owner", created.Role);

        var memberships = await client.GetFromJsonAsync<HouseholdResponse[]>(
            "/api/households");
        var saved = Assert.Single(memberships ?? []);
        Assert.Equal(created, saved);

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var categories = await dbContext.Categories
            .AsNoTracking()
            .Where(category => category.HouseholdId == created.Id)
            .ToListAsync();

        Assert.Equal(39, categories.Count);
        Assert.Equal(10, categories.Count(category => category.ParentCategoryId == null));
        Assert.Equal(29, categories.Count(category => category.ParentCategoryId != null));
    }

    [Fact]
    public async Task CreateInitialHousehold_WithExistingMembership_ReturnsConflict()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var firstResponse = await PostWithAntiforgeryToken(
            client,
            "/api/households",
            CreateHouseholdRequest(),
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);

        var duplicateResponse = await PostWithAntiforgeryToken(
            client,
            "/api/households",
            CreateHouseholdRequest("Another Household"),
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Conflict, duplicateResponse.StatusCode);
    }

    [Fact]
    public async Task CreateInitialHousehold_WithUnsupportedTimeZone_ReturnsBadRequest()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var response = await PostWithAntiforgeryToken(
            client,
            "/api/households",
            new
            {
                name = "Scott Household",
                defaultCurrency = "CAD",
                timeZoneId = "Not/A-Time-Zone"
            },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(
            await client.GetFromJsonAsync<HouseholdResponse[]>("/api/households") ?? []);
    }

    [Fact]
    public async Task CreateInitialHousehold_WithUnsupportedCurrency_ReturnsBadRequest()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var response = await PostWithAntiforgeryToken(
            client,
            "/api/households",
            new
            {
                name = "Scott Household",
                defaultCurrency = "ZZZ",
                timeZoneId = "America/Vancouver"
            },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(
            await client.GetFromJsonAsync<HouseholdResponse[]>("/api/households") ?? []);
    }

    private static object CreateHouseholdRequest(
        string name = "Scott Household") =>
        new
        {
            name,
            defaultCurrency = "CAD",
            timeZoneId = "America/Vancouver"
        };

    private static async Task Register(HttpClient client)
    {
        var response = await PostWithAntiforgeryToken(
            client,
            "/api/auth/register",
            new
            {
                email = $"household-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Household Test"
            },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<string> GetAntiforgeryToken(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/antiforgery");
        response.EnsureSuccessStatusCode();

        var token = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        return token?.Token ?? throw new InvalidOperationException(
            "The antiforgery endpoint did not return a token.");
    }

    private static Task<HttpResponseMessage> PostWithAntiforgeryToken<TRequest>(
        HttpClient client,
        string requestUri,
        TRequest body,
        string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", token);

        return client.SendAsync(request);
    }

    private sealed record AntiforgeryTokenResponse(string Token);

    private sealed record HouseholdResponse(
        Guid Id,
        string Name,
        string DefaultCurrency,
        string TimeZoneId,
        string Role);
}
