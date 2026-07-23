using System.Net;
using System.Net.Http.Json;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

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
    public async Task CopySelectedMonth_CopiesLinesIntoNewDraft()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var sourcePath = $"/api/households/{householdId}/budgets/2026/5";
        var create = await SendWithAntiforgery(
            client, HttpMethod.Post, sourcePath, new { scope = "Household" }, token);
        var source = await create.Content.ReadFromJsonAsync<BudgetResponse>();
        var food = Assert.Single(source!.Categories, category => category.Name == "Food & Dining");
        var save = await SendWithAntiforgery(
            client, HttpMethod.Put,
            $"/api/households/{householdId}/budgets/{source.Id}",
            new { lines = new[] { new { categoryId = food.Id, budgetedAmount = 600m } } },
            token);
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var options = await client.GetFromJsonAsync<BudgetOptionResponse[]>(
            $"/api/households/{householdId}/budgets?scope=Household") ?? [];
        var sourceOption = Assert.Single(options, option => option.Id == source.Id);
        Assert.Equal(2026, sourceOption.Year);
        Assert.Equal(5, sourceOption.Month);

        var copy = await SendWithAntiforgery(
            client, HttpMethod.Post,
            $"/api/households/{householdId}/budgets/2026/7/copy",
            new { scope = "Household", sourceYear = 2026, sourceMonth = 5 }, token);

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

    [Fact]
    public async Task BudgetActuals_RollUpExpensesAndRespectScopeAndExclusions()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        Guid foodId;
        Guid groceriesId;
        var now = DateTimeOffset.UtcNow;

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var food = await dbContext.Categories.SingleAsync(category =>
                category.HouseholdId == householdId && category.Name == "Food & Dining");
            var groceries = await dbContext.Categories.SingleAsync(category =>
                category.HouseholdId == householdId && category.Name == "Groceries");
            foodId = food.Id;
            groceriesId = groceries.Id;
            var householdAccount = Account.CreateHousehold(
                householdId, "Joint", AccountType.Chequing, "CAD", null, null, now);
            var usdAccount = Account.CreateHousehold(
                householdId, "US Card", AccountType.CreditCard, "USD", null, null, now);
            var personalAccount = Account.CreatePersonal(
                householdId, userId, "Personal", AccountType.CreditCard, "CAD", null, null, now);
            dbContext.Accounts.AddRange(householdAccount, usdAccount, personalAccount);

            Transaction Add(Guid accountId, Guid? categoryId, decimal amount,
                string description, bool excluded = false)
            {
                var transaction = Transaction.CreateManual(
                    householdId, accountId, categoryId, new DateOnly(2026, 7, 15), null,
                    amount, description, null, null, excluded, userId, now);
                dbContext.Transactions.Add(transaction);
                return transaction;
            }

            Add(householdAccount.Id, groceriesId, 100m, "Groceries");
            Add(householdAccount.Id, groceriesId, -10m, "Grocery refund");
            Add(householdAccount.Id, foodId, 25m, "Direct food expense");
            Add(householdAccount.Id, null, 40m, "Uncategorized expense");
            Add(householdAccount.Id, groceriesId, 1000m, "Excluded", excluded: true);
            var voided = Add(householdAccount.Id, groceriesId, 1000m, "Voided");
            voided.Void(userId, now);
            Add(usdAccount.Id, groceriesId, 75m, "Different currency");
            Add(personalAccount.Id, groceriesId, 500m, "Personal expense");
            var previousMonthExpense = Transaction.CreateManual(
                householdId, householdAccount.Id, groceriesId,
                new DateOnly(2026, 6, 15), null, 120m, "Previous month groceries",
                null, null, false, userId, now);
            dbContext.Transactions.Add(previousMonthExpense);
            await dbContext.SaveChangesAsync();
        }

        var token = await GetAntiforgeryToken(client);
        var createPrevious = await SendWithAntiforgery(
            client, HttpMethod.Post,
            $"/api/households/{householdId}/budgets/2026/6",
            new { scope = "Household" }, token);
        var previousBudget = await createPrevious.Content.ReadFromJsonAsync<BudgetResponse>();
        var savePrevious = await SendWithAntiforgery(
            client, HttpMethod.Put,
            $"/api/households/{householdId}/budgets/{previousBudget!.Id}",
            new { lines = new[] { new { categoryId = groceriesId, budgetedAmount = 240m } } },
            token);
        Assert.Equal(HttpStatusCode.OK, savePrevious.StatusCode);

        var budget = await client.GetFromJsonAsync<BudgetResponse>(
            $"/api/households/{householdId}/budgets/2026/7?scope=Household");

        Assert.NotNull(budget);
        var foodResult = Assert.Single(budget.Categories, category => category.Id == foodId);
        var groceriesResult = Assert.Single(
            foodResult.Children, category => category.Id == groceriesId);
        Assert.Equal(90m, groceriesResult.ActualAmount);
        Assert.Equal(25m, foodResult.DirectActualAmount);
        Assert.Equal(115m, foodResult.ActualAmount);
        Assert.Equal(10m, groceriesResult.AverageMonthlyActualAmount);
        Assert.Equal(240m, groceriesResult.LastMonthBudgetedAmount);
        Assert.Equal(120m, groceriesResult.LastMonthActualAmount);
        Assert.Equal(240m, foodResult.LastMonthBudgetedAmount);
        Assert.Equal(120m, foodResult.LastMonthActualAmount);
        Assert.Equal(40m, budget.UncategorizedActualAmount);
        Assert.Equal(1, budget.CurrencyMismatchTransactionCount);
    }

    private static async Task<Guid> Register(HttpClient client)
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
        return (await client.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me"))!.Id;
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
    private sealed record CurrentUserResponse(Guid Id);
    private sealed record BudgetResponse(
        Guid? Id,
        string Currency,
        string? Status,
        IReadOnlyList<BudgetCategoryResponse> Categories,
        decimal UncategorizedActualAmount,
        int CurrencyMismatchTransactionCount);
    private sealed record BudgetOptionResponse(Guid Id, int Year, int Month, string Status);
    private sealed record BudgetCategoryResponse(
        Guid Id,
        string Name,
        decimal? BudgetedAmount,
        decimal ActualAmount,
        decimal DirectActualAmount,
        decimal AverageMonthlyActualAmount,
        decimal? LastMonthBudgetedAmount,
        decimal LastMonthActualAmount,
        IReadOnlyList<BudgetCategoryResponse> Children);
}
