using System.Net;
using System.Net.Http.Json;

namespace BudgetApp.Tests.Integration;

public sealed class CategoryManagementTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Categories_WithoutAuthentication_ReturnUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var householdId = Guid.NewGuid();

        var listResponse = await client.GetAsync(CategoryPath(householdId));
        var createResponse = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            CategoryPath(householdId),
            new { name = "Gifts", type = "Expense" },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Unauthorized, listResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, createResponse.StatusCode);
    }

    [Fact]
    public async Task Categories_ForAnotherHousehold_ReturnForbidden()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var response = await client.GetAsync(CategoryPath(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Owner_CanManageCategoryLifecycleAndOrder()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);

        var initial = await GetCategories(client, householdId);
        Assert.Equal(10, initial.Count);
        Assert.Equal(29, initial.Sum(category => category.Children.Count));

        var rootId = await CreateCategory(
            client,
            householdId,
            new { name = "Gifts", type = "Expense" },
            token);
        var childId = await CreateCategory(
            client,
            householdId,
            new { name = "Birthdays", parentCategoryId = rootId },
            token);

        var renameResponse = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"{CategoryPath(householdId)}/{childId}",
            new { name = "Birthday gifts" },
            token);
        Assert.Equal(HttpStatusCode.NoContent, renameResponse.StatusCode);

        var parentDeactivateResponse = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"{CategoryPath(householdId)}/{rootId}/deactivate",
            new { },
            token);
        Assert.Equal(HttpStatusCode.BadRequest, parentDeactivateResponse.StatusCode);

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SetActive(client, householdId, childId, false, token)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SetActive(client, householdId, rootId, false, token)).StatusCode);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await SetActive(client, householdId, childId, true, token)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SetActive(client, householdId, rootId, true, token)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SetActive(client, householdId, childId, true, token)).StatusCode);

        var beforeReorder = (await GetCategories(client, householdId))
            .Where(category => category.Type == "Expense")
            .ToList();
        var reversedIds = beforeReorder
            .Select(category => category.Id)
            .Reverse()
            .ToArray();
        var reorderResponse = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"{CategoryPath(householdId)}/order",
            new { categoryIds = reversedIds },
            token);
        Assert.Equal(HttpStatusCode.NoContent, reorderResponse.StatusCode);

        var final = await GetCategories(client, householdId);
        var gifts = Assert.Single(final, category => category.Id == rootId);
        var renamedChild = Assert.Single(gifts.Children);
        Assert.Equal("Birthday gifts", renamedChild.Name);
        Assert.True(gifts.IsActive);
        Assert.True(renamedChild.IsActive);
        Assert.Equal(
            reversedIds,
            final.Where(category => category.Type == "Expense")
                .Select(category => category.Id));
    }

    [Fact]
    public async Task CreateDuplicateSiblingName_ReturnsConflict()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);

        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            CategoryPath(householdId),
            new { name = " housing ", type = "Expense" },
            token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    private static string CategoryPath(Guid householdId) =>
        $"/api/households/{householdId}/categories";

    private static async Task<IReadOnlyList<CategoryResponse>> GetCategories(
        HttpClient client,
        Guid householdId) =>
        await client.GetFromJsonAsync<CategoryResponse[]>(CategoryPath(householdId)) ?? [];

    private static async Task<Guid> CreateCategory<TRequest>(
        HttpClient client,
        Guid householdId,
        TRequest body,
        string token)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            CategoryPath(householdId),
            body,
            token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<CreateCategoryResponse>();
        return created?.Id ?? throw new InvalidOperationException(
            "The category endpoint did not return an ID.");
    }

    private static Task<HttpResponseMessage> SetActive(
        HttpClient client,
        Guid householdId,
        Guid categoryId,
        bool isActive,
        string token) =>
        SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"{CategoryPath(householdId)}/{categoryId}/{(isActive ? "reactivate" : "deactivate")}",
            new { },
            token);

    private static async Task Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"categories-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Category Test"
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
                name = "Category Test Household",
                defaultCurrency = "CAD",
                timeZoneId = "America/Vancouver"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<CreateHouseholdResponse>();
        return created?.Id ?? throw new InvalidOperationException(
            "The household endpoint did not return an ID.");
    }

    private static async Task<string> GetAntiforgeryToken(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/antiforgery");
        response.EnsureSuccessStatusCode();

        var token = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        return token?.Token ?? throw new InvalidOperationException(
            "The antiforgery endpoint did not return a token.");
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

    private sealed record AntiforgeryTokenResponse(string Token);
    private sealed record CreateCategoryResponse(Guid Id);
    private sealed record CreateHouseholdResponse(Guid Id);
    private sealed record CategoryResponse(
        Guid Id,
        string Name,
        string Type,
        int DisplayOrder,
        bool IsActive,
        IReadOnlyList<CategoryResponse> Children);
}
