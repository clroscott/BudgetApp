using System.Net;
using System.Net.Http.Json;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class AnnualBudgetOverviewTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Overview_ReconcilesBudgetsAndTransactions_AndDistinguishesMissingMonths()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);

        await SeedAnnualData(householdId);

        var response = await client.GetAsync(
            $"/api/households/{householdId}/annual-budget-overview/2026?scope=Household");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var overview = await response.Content.ReadFromJsonAsync<AnnualOverviewResponse>();
        Assert.NotNull(overview);
        Assert.Equal("CAD", overview.Currency);
        Assert.Equal(2, overview.BudgetedMonthCount);
        Assert.Equal(500m, overview.AnnualBudgetedAmount);
        Assert.Equal(175m, overview.ActualSpendingAmount);
        Assert.Equal(325m, overview.RemainingAmount);
        Assert.Equal(1000m, overview.IncomeAmount);
        Assert.Equal(825m, overview.NetCashFlowAmount);
        Assert.Equal(25m, overview.UncategorizedSpendingAmount);

        var january = Assert.Single(overview.Months, month => month.Month == 1);
        Assert.Equal("Active", january.Status);
        Assert.Equal(500m, january.BudgetedAmount);
        Assert.Equal(125m, january.ActualSpendingAmount);
        Assert.Equal(375m, january.RemainingAmount);

        var february = Assert.Single(overview.Months, month => month.Month == 2);
        Assert.Equal("Draft", february.Status);
        Assert.Equal(0m, february.BudgetedAmount);
        Assert.Equal(50m, february.ActualSpendingAmount);
        Assert.Equal(-50m, february.RemainingAmount);

        var march = Assert.Single(overview.Months, month => month.Month == 3);
        Assert.Null(march.Status);
        Assert.Null(march.BudgetedAmount);
        Assert.Null(march.RemainingAmount);

        var food = Assert.Single(
            overview.Categories,
            category => category.Name == "Food & Dining");
        Assert.Equal(500m, food.BudgetedAmount);
        Assert.Equal(150m, food.ActualAmount);
        var groceries = Assert.Single(
            food.Children,
            category => category.Name == "Groceries");
        Assert.Equal(500m, groceries.BudgetedAmount);
        Assert.Equal(150m, groceries.ActualAmount);

        var personal = await client.GetFromJsonAsync<AnnualOverviewResponse>(
            $"/api/households/{householdId}/annual-budget-overview/2026?scope=Personal");
        Assert.NotNull(personal);
        Assert.Equal(999m, personal.ActualSpendingAmount);
        Assert.Equal(0, personal.BudgetedMonthCount);
        Assert.Null(personal.RemainingAmount);
    }

    [Fact]
    public async Task Overview_RejectsAUserFromAnotherHousehold()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        await Register(owner);
        var householdId = await CreateHousehold(owner);
        using var outsider = factory.CreateAuthenticatedTestClient();
        await Register(outsider);

        var response = await outsider.GetAsync(
            $"/api/households/{householdId}/annual-budget-overview/2026?scope=Household");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private async Task SeedAnnualData(Guid householdId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var userId = await dbContext.Users
            .Where(user => dbContext.HouseholdMembers.Any(member =>
                member.HouseholdId == householdId &&
                member.UserId == user.Id))
            .Select(user => user.Id)
            .SingleAsync();
        var food = await dbContext.Categories
            .SingleAsync(category =>
                category.HouseholdId == householdId &&
                category.Name == "Food & Dining");
        var groceries = await dbContext.Categories
            .SingleAsync(category =>
                category.HouseholdId == householdId &&
                category.ParentCategoryId == food.Id &&
                category.Name == "Groceries");
        var income = await dbContext.Categories
            .SingleAsync(category =>
                category.HouseholdId == householdId &&
                category.Type == CategoryType.Income &&
                !category.ParentCategoryId.HasValue);
        var now = DateTimeOffset.UtcNow;
        var householdAccount = Account.CreateHousehold(
            householdId,
            "Household chequing",
            AccountType.Chequing,
            "CAD",
            null,
            null,
            now);
        var personalAccount = Account.CreatePersonal(
            householdId,
            userId,
            "Personal chequing",
            AccountType.Chequing,
            "CAD",
            null,
            null,
            now);
        var january = BudgetMonth.CreateHousehold(
            householdId,
            2026,
            1,
            "CAD",
            now);
        january.AddLine(groceries.Id, 500m, now);
        january.Activate(now);
        var february = BudgetMonth.CreateHousehold(
            householdId,
            2026,
            2,
            "CAD",
            now);
        february.AddLine(groceries.Id, 0m, now);

        dbContext.Accounts.AddRange(householdAccount, personalAccount);
        dbContext.BudgetMonths.AddRange(january, february);
        dbContext.Transactions.AddRange(
            CreateTransaction(
                householdId,
                householdAccount.Id,
                groceries.Id,
                userId,
                new DateOnly(2026, 1, 8),
                100m,
                "Groceries"),
            CreateTransaction(
                householdId,
                householdAccount.Id,
                groceries.Id,
                userId,
                new DateOnly(2026, 2, 8),
                50m,
                "Groceries"),
            CreateTransaction(
                householdId,
                householdAccount.Id,
                income.Id,
                userId,
                new DateOnly(2026, 1, 15),
                -1000m,
                "Pay"),
            CreateTransaction(
                householdId,
                householdAccount.Id,
                null,
                userId,
                new DateOnly(2026, 1, 20),
                25m,
                "Uncategorized"),
            CreateTransaction(
                householdId,
                personalAccount.Id,
                groceries.Id,
                userId,
                new DateOnly(2026, 1, 22),
                999m,
                "Personal purchase"));
        await dbContext.SaveChangesAsync();
    }

    private static Transaction CreateTransaction(
        Guid householdId,
        Guid accountId,
        Guid? categoryId,
        Guid userId,
        DateOnly date,
        decimal amount,
        string description) =>
        Transaction.CreateManual(
            householdId,
            accountId,
            categoryId,
            date,
            null,
            amount,
            description,
            null,
            null,
            false,
            userId,
            DateTimeOffset.UtcNow);

    private static async Task Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"annual-overview-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Annual Overview Test"
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
                name = "Annual Overview Household",
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
    private sealed record AnnualOverviewResponse(
        string Currency,
        int BudgetedMonthCount,
        decimal AnnualBudgetedAmount,
        decimal ActualSpendingAmount,
        decimal? RemainingAmount,
        decimal IncomeAmount,
        decimal NetCashFlowAmount,
        decimal UncategorizedSpendingAmount,
        IReadOnlyList<AnnualMonthResponse> Months,
        IReadOnlyList<AnnualCategoryResponse> Categories);
    private sealed record AnnualMonthResponse(
        int Month,
        string? Status,
        decimal? BudgetedAmount,
        decimal ActualSpendingAmount,
        decimal? RemainingAmount);
    private sealed record AnnualCategoryResponse(
        string Name,
        decimal? BudgetedAmount,
        decimal ActualAmount,
        IReadOnlyList<AnnualCategoryResponse> Children);
}
