using System.Net;
using System.Net.Http.Json;

namespace BudgetApp.Tests.Integration;

public sealed class BudgetManagementTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Owner_CanCreateSaveActivateAndCloseBudget()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var path = $"/api/households/{householdId}/budgets/2026/7";

        var empty = await client.GetFromJsonAsync<BudgetResponse>($"{path}?scope=Household");
        Assert.NotNull(empty);
        Assert.Null(empty.Id);
        Assert.Equal("CAD", empty.Currency);

        var createResponse = await SendWithAntiforgery(
            client, HttpMethod.Post, path, new { scope = "Household" }, token);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<BudgetResponse>();
        Assert.NotNull(created?.Id);
        Assert.Equal("Draft", created.Status);

        var food = Assert.Single(created.Categories, category => category.Name == "Food & Dining");
        var groceries = Assert.Single(food.Children, category => category.Name == "Groceries");
        var saveResponse = await SendWithAntiforgery(
            client, HttpMethod.Put, $"/api/households/{householdId}/budgets/{created.Id}",
            new { lines = new[] { new { categoryId = groceries.Id, budgetedAmount = 0m } } }, token);
        Assert.True(
            saveResponse.StatusCode == HttpStatusCode.OK,
            await saveResponse.Content.ReadAsStringAsync());
        var saved = await saveResponse.Content.ReadFromJsonAsync<BudgetResponse>();
        Assert.Equal(0m, Assert.Single(
            Assert.Single(saved!.Categories, category => category.Id == food.Id).Children,
            category => category.Id == groceries.Id).BudgetedAmount);

        Assert.Equal(HttpStatusCode.OK, (await SendWithAntiforgery(
            client, HttpMethod.Post,
            $"/api/households/{householdId}/budgets/{created.Id}/activate", new { }, token)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await SendWithAntiforgery(
            client, HttpMethod.Delete,
            $"/api/households/{householdId}/budgets/{created.Id}", new { }, token)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SendWithAntiforgery(
            client, HttpMethod.Post,
            $"/api/households/{householdId}/budgets/{created.Id}/close", new { }, token)).StatusCode);

        var editClosed = await SendWithAntiforgery(
            client, HttpMethod.Put, $"/api/households/{householdId}/budgets/{created.Id}",
            new { lines = Array.Empty<object>() }, token);
        Assert.Equal(HttpStatusCode.BadRequest, editClosed.StatusCode);

        var reopen = await SendWithAntiforgery(
            client, HttpMethod.Post,
            $"/api/households/{householdId}/budgets/{created.Id}/reopen", new { }, token);
        Assert.Equal(HttpStatusCode.OK, reopen.StatusCode);
        Assert.Equal(
            "Active",
            (await reopen.Content.ReadFromJsonAsync<BudgetResponse>())!.Status);

        var editReopened = await SendWithAntiforgery(
            client, HttpMethod.Put, $"/api/households/{householdId}/budgets/{created.Id}",
            new { lines = Array.Empty<object>() }, token);
        Assert.Equal(HttpStatusCode.OK, editReopened.StatusCode);
    }

    [Fact]
    public async Task Save_RejectsOverallAndDetailedLinesInSameSection()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var path = $"/api/households/{householdId}/budgets/2026/8";
        var response = await SendWithAntiforgery(
            client, HttpMethod.Post, path, new { scope = "Personal" }, token);
        var budget = await response.Content.ReadFromJsonAsync<BudgetResponse>();
        var food = Assert.Single(budget!.Categories, category => category.Name == "Food & Dining");
        var groceries = Assert.Single(food.Children, category => category.Name == "Groceries");

        var save = await SendWithAntiforgery(
            client, HttpMethod.Put, $"/api/households/{householdId}/budgets/{budget.Id}",
            new
            {
                lines = new[]
                {
                    new { categoryId = food.Id, budgetedAmount = 500m },
                    new { categoryId = groceries.Id, budgetedAmount = 300m }
                }
            }, token);

        Assert.Equal(HttpStatusCode.BadRequest, save.StatusCode);
    }

    [Fact]
    public async Task CopyPreviousMonth_CopiesLinesIntoNewDraft()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var junePath = $"/api/households/{householdId}/budgets/2026/6";
        var create = await SendWithAntiforgery(
            client, HttpMethod.Post, junePath, new { scope = "Household" }, token);
        var june = await create.Content.ReadFromJsonAsync<BudgetResponse>();
        var food = Assert.Single(june!.Categories, category => category.Name == "Food & Dining");
        var save = await SendWithAntiforgery(
            client, HttpMethod.Put,
            $"/api/households/{householdId}/budgets/{june.Id}",
            new { lines = new[] { new { categoryId = food.Id, budgetedAmount = 600m } } },
            token);
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        var copy = await SendWithAntiforgery(
            client, HttpMethod.Post,
            $"/api/households/{householdId}/budgets/2026/7/copy-previous",
            new { scope = "Household" }, token);

        Assert.Equal(HttpStatusCode.OK, copy.StatusCode);
        var july = await copy.Content.ReadFromJsonAsync<BudgetResponse>();
        Assert.Equal("Draft", july!.Status);
        Assert.Equal(
            600m,
            Assert.Single(july.Categories, category => category.Id == food.Id).BudgetedAmount);
    }

    [Fact]
    public async Task CreateFromRecurring_AggregatesSubcategoryAmounts()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var budgetPath = $"/api/households/{householdId}/budgets/2026/9";
        var empty = await client.GetFromJsonAsync<BudgetResponse>(
            $"{budgetPath}?scope=Personal");
        var subscriptions = Assert.Single(
            empty!.Categories, category => category.Name == "Subscriptions");
        var streaming = Assert.Single(
            subscriptions.Children, category => category.Name == "Streaming");
        foreach (var item in new[] { ("Netflix", 22.99m), ("Disney+", 15.99m) })
        {
            var response = await SendWithAntiforgery(
                client, HttpMethod.Post,
                $"/api/households/{householdId}/recurring-expenses",
                new
                {
                    name = item.Item1,
                    amount = item.Item2,
                    scope = "Personal",
                    subcategoryId = streaming.Id,
                    accountId = (Guid?)null,
                    expectedDayOfMonth = 15,
                    startsOn = "2026-01-01",
                    endsOn = (string?)null
                }, token);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }

        var build = await SendWithAntiforgery(
            client, HttpMethod.Post,
            $"{budgetPath}/from-recurring",
            new { scope = "Personal" }, token);

        Assert.Equal(HttpStatusCode.OK, build.StatusCode);
        var budget = await build.Content.ReadFromJsonAsync<BudgetResponse>();
        var savedStreaming = Assert.Single(
            Assert.Single(budget!.Categories, category => category.Id == subscriptions.Id).Children,
            category => category.Id == streaming.Id);
        Assert.Equal(38.98m, savedStreaming.BudgetedAmount);
    }

    [Fact]
    public async Task DeleteDraft_RemovesBudgetAndReturnsPeriodToEmptyState()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var periodPath = $"/api/households/{householdId}/budgets/2026/10";
        var create = await SendWithAntiforgery(
            client, HttpMethod.Post, periodPath, new { scope = "Household" }, token);
        var budget = await create.Content.ReadFromJsonAsync<BudgetResponse>();

        var delete = await SendWithAntiforgery(
            client, HttpMethod.Delete,
            $"/api/households/{householdId}/budgets/{budget!.Id}", new { }, token);

        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        var empty = await client.GetFromJsonAsync<BudgetResponse>(
            $"{periodPath}?scope=Household");
        Assert.Null(empty!.Id);
    }

    private static async Task Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client, HttpMethod.Post, "/api/auth/register",
            new
            {
                email = $"budgets-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Budget Test"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client, HttpMethod.Post, "/api/households",
            new { name = "Budget Test Household", defaultCurrency = "CAD", timeZoneId = "America/Vancouver" },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CreateResponse>())!.Id;
    }

    private static async Task<string> GetAntiforgeryToken(HttpClient client) =>
        (await (await client.GetAsync("/api/auth/antiforgery"))
            .Content.ReadFromJsonAsync<AntiforgeryResponse>())!.Token;

    private static Task<HttpResponseMessage> SendWithAntiforgery<T>(
        HttpClient client, HttpMethod method, string path, T body, string token)
    {
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return client.SendAsync(request);
    }

    private sealed record AntiforgeryResponse(string Token);
    private sealed record CreateResponse(Guid Id);
    private sealed record BudgetResponse(
        Guid? Id,
        string Currency,
        string? Status,
        IReadOnlyList<BudgetCategoryResponse> Categories);
    private sealed record BudgetCategoryResponse(
        Guid Id,
        string Name,
        decimal? BudgetedAmount,
        IReadOnlyList<BudgetCategoryResponse> Children);
}
