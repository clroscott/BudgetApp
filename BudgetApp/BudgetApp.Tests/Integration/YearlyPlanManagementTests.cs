using System.Net;
using System.Net.Http.Json;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class YearlyPlanManagementTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Save_PreservesOverallOrDetailedRule()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var empty = await client.GetFromJsonAsync<YearlyPlanResponse>(
            $"/api/households/{householdId}/yearly-plans/2027?scope=Household");
        var food = Assert.Single(
            empty!.Categories,
            category => category.Name == "Food & Dining");
        var groceries = Assert.Single(
            food.Children,
            category => category.Name == "Groceries");
        var token = await GetAntiforgeryToken(client);

        var save = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/households/{householdId}/yearly-plans/2027",
            new
            {
                scope = "Household",
                fiscalYearStartMonth = 3,
                lines = new[]
                {
                    new { categoryId = food.Id, annualTargetAmount = 1200m }
                }
            },
            token);

        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var saved = await save.Content.ReadFromJsonAsync<YearlyPlanResponse>();
        Assert.Equal(new DateOnly(2027, 3, 1), saved!.StartsOn);
        Assert.Equal(new DateOnly(2028, 2, 29), saved.EndsOn);
        var savedFood = Assert.Single(
            saved.Categories,
            category => category.Id == food.Id);
        Assert.Equal(1200m, savedFood.AnnualTargetAmount);
        Assert.Equal(100m, savedFood.EquivalentMonthlyAmount);

        var coveredMonth = await client.GetFromJsonAsync<MonthlyBudgetResponse>(
            $"/api/households/{householdId}/budgets/2028/2?scope=Household");
        Assert.Equal(
            100m,
            Assert.Single(
                coveredMonth!.Categories,
                category => category.Id == food.Id).MonthlyTargetAmount);

        var monthWithoutPlan = await client.GetFromJsonAsync<MonthlyBudgetResponse>(
            $"/api/households/{householdId}/budgets/2028/3?scope=Household");
        Assert.Null(Assert.Single(
            monthWithoutPlan!.Categories,
            category => category.Id == food.Id).MonthlyTargetAmount);

        var invalid = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/households/{householdId}/yearly-plans/2027",
            new
            {
                scope = "Household",
                lines = new[]
                {
                    new { categoryId = food.Id, annualTargetAmount = 1200m },
                    new { categoryId = groceries.Id, annualTargetAmount = 600m }
                }
            },
            token);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var changedPeriod = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/households/{householdId}/yearly-plans/2027",
            new
            {
                scope = "Household",
                fiscalYearStartMonth = 4,
                lines = new[]
                {
                    new { categoryId = food.Id, annualTargetAmount = 1200m }
                }
            },
            token);
        Assert.Equal(HttpStatusCode.OK, changedPeriod.StatusCode);
        var changed = await changedPeriod.Content.ReadFromJsonAsync<YearlyPlanResponse>();
        Assert.Equal(new DateOnly(2027, 4, 1), changed!.StartsOn);
        Assert.Equal(new DateOnly(2028, 3, 31), changed.EndsOn);
    }

    [Fact]
    public async Task AllocateAll_UsesFiscalRange_ReconcilesCents_AndSkipsExisting()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);
        var changeDefault = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/households/{householdId}/yearly-plans/default-start-month",
            new { fiscalYearStartMonth = 4 },
            token);
        Assert.Equal(HttpStatusCode.OK, changeDefault.StatusCode);
        var empty = await client.GetFromJsonAsync<YearlyPlanResponse>(
            $"/api/households/{householdId}/yearly-plans/2027?scope=Personal");
        Assert.Equal(new DateOnly(2027, 4, 1), empty!.StartsOn);
        Assert.Equal(new DateOnly(2028, 3, 31), empty.EndsOn);
        var food = Assert.Single(
            empty.Categories,
            category => category.Name == "Food & Dining");

        var save = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/households/{householdId}/yearly-plans/2027",
            new
            {
                scope = "Personal",
                lines = new[]
                {
                    new { categoryId = food.Id, annualTargetAmount = 100m }
                }
            },
            token);
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var existing = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"/api/households/{householdId}/budgets/2027/4",
            new { scope = "Personal" },
            token);
        Assert.Equal(HttpStatusCode.Created, existing.StatusCode);

        var allocation = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"/api/households/{householdId}/yearly-plans/2027/allocate",
            new
            {
                scope = "Personal",
                months = FiscalMonths(2027, 4),
                replaceExistingDrafts = false
            },
            token);
        Assert.Equal(HttpStatusCode.OK, allocation.StatusCode);
        var result = await allocation.Content.ReadFromJsonAsync<AllocationResponse>();
        Assert.Equal(11, result!.CreatedCount);
        Assert.Equal(1, result.SkippedCount);
        Assert.Contains(
            result.Months,
            month => month.Year == 2028 && month.Month == 3);

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var budgets = await dbContext.BudgetMonths
            .AsNoTracking()
            .Include(budget => budget.Lines)
            .Where(budget =>
                budget.HouseholdId == householdId &&
                budget.Scope == BudgetApp.Domain.Budgeting.BudgetScope.Personal &&
                (budget.Year == 2027 || budget.Year == 2028))
            .ToListAsync();
        Assert.Equal(12, budgets.Count);
        Assert.Empty(Assert.Single(
            budgets,
            budget => budget.Year == 2027 && budget.Month == 4).Lines);
        Assert.Equal(
            91.66m,
            budgets.SelectMany(budget => budget.Lines)
                .Sum(line => line.BudgetedAmount));

        var replace = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"/api/households/{householdId}/yearly-plans/2027/allocate",
            new
            {
                scope = "Personal",
                months = new[]
                {
                    new { year = 2027, month = 4 }
                },
                replaceExistingDrafts = true
            },
            token);
        Assert.Equal(HttpStatusCode.OK, replace.StatusCode);
        Assert.Equal(
            1,
            (await replace.Content.ReadFromJsonAsync<AllocationResponse>())!
                .ReplacedDraftCount);

        dbContext.ChangeTracker.Clear();
        var allAmounts = await dbContext.BudgetLines
            .AsNoTracking()
            .Where(line => dbContext.BudgetMonths
                .Where(budget =>
                    budget.HouseholdId == householdId &&
                    budget.Scope == BudgetApp.Domain.Budgeting.BudgetScope.Personal)
                .Select(budget => budget.Id)
                .Contains(line.BudgetMonthId))
            .SumAsync(line => line.BudgetedAmount);
        Assert.Equal(100m, allAmounts);
    }

    [Fact]
    public async Task OtherHouseholdUser_CannotReadAnnualTargets()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        await Register(owner);
        var householdId = await CreateHousehold(owner);
        using var outsider = factory.CreateAuthenticatedTestClient();
        await Register(outsider);

        var response = await outsider.GetAsync(
            $"/api/households/{householdId}/yearly-plans/2027?scope=Household");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static async Task Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"yearly-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Yearly Plan Test"
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
                name = "Yearly Plan Household",
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

    private static IReadOnlyList<AllocationRequestMonth> FiscalMonths(
        int startYear,
        int startMonth)
    {
        var start = new DateOnly(startYear, startMonth, 1);
        return Enumerable.Range(0, 12)
            .Select(index => start.AddMonths(index))
            .Select(date => new AllocationRequestMonth(date.Year, date.Month))
            .ToList();
    }

    private sealed record AntiforgeryResponse(string Token);
    private sealed record CreateResponse(Guid Id);
    private sealed record YearlyPlanResponse(
        Guid? Id,
        DateOnly StartsOn,
        DateOnly EndsOn,
        IReadOnlyList<YearlyCategoryResponse> Categories);
    private sealed record YearlyCategoryResponse(
        Guid Id,
        string Name,
        decimal? AnnualTargetAmount,
        decimal? EquivalentMonthlyAmount,
        IReadOnlyList<YearlyCategoryResponse> Children);
    private sealed record AllocationResponse(
        int CreatedCount,
        int ReplacedDraftCount,
        int SkippedCount,
        IReadOnlyList<AllocationMonthResponse> Months);
    private sealed record AllocationMonthResponse(
        int Year,
        int Month,
        string Result,
        Guid? BudgetId);
    private sealed record AllocationRequestMonth(int Year, int Month);
    private sealed record MonthlyBudgetResponse(
        IReadOnlyList<MonthlyBudgetCategoryResponse> Categories);
    private sealed record MonthlyBudgetCategoryResponse(
        Guid Id,
        string Name,
        decimal? MonthlyTargetAmount,
        IReadOnlyList<MonthlyBudgetCategoryResponse> Children);
}
