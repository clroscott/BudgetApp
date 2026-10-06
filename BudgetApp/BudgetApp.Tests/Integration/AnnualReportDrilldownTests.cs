using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class AnnualReportDrilldownTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Theory]
    [InlineData("Household", 208.8389, 107)]
    [InlineData("Personal", 156.3389, 106)]
    public async Task SpendingTotals_ReconcileAnnualCategoryMonthAndExport_AcrossAllPages(
        string scope, double expectedAmount, int expectedCount)
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(householdId, ownerId, memberId);
        var seed = await Seed(householdId, ownerId, memberId);

        var annual = (await owner.GetFromJsonAsync<AnnualBudgetOverviewModel>(
            $"/api/households/{householdId}/annual-budget-overview/2026?scope={scope}"))!;
        var query = $"budgetInclusion={scope}&currency=CAD&spendingOnly=true&fromDate=2026-01-01&toDate=2026-12-31";
        var first = await List(owner, householdId, query + "&page=1");
        var second = await List(owner, householdId, query + "&page=2");
        Assert.Equal((decimal)expectedAmount, annual.ActualSpendingAmount);
        Assert.Equal(expectedCount, first.TotalCount);
        Assert.Equal(100, first.Items.Count);
        Assert.Equal(expectedCount - 100, second.Items.Count);
        Assert.Equal(2, first.TotalPages);
        Assert.Equal(annual.ActualSpendingAmount, first.TotalsByCurrency["CAD"]);
        Assert.Equal(first.TotalsByCurrency["CAD"], second.TotalsByCurrency["CAD"]);
        var all = first.Items.Concat(second.Items).ToList();
        Assert.Equal(expectedCount, all.Select(t => t.Id).Distinct().Count());
        Assert.Equal(annual.ActualSpendingAmount, all.Sum(t => t.Amount));
        Assert.All(all, row => {
            Assert.False(row.IsVoided);
            Assert.False(row.IsExcludedFromBudget);
            Assert.Equal("CAD", row.Currency);
        });
        Assert.Contains(all, row => row.Amount == -2.3456m); // Expense refunds reduce spending.
        Assert.DoesNotContain(all, row => row.Description.StartsWith("Not spending"));

        var food = annual.Categories.Single(c => c.Id == seed.FoodId);
        var categoryQuery = query + $"&categoryId={food.Id}";
        var rootFirst = await List(owner, householdId, categoryQuery);
        var rootSecond = await List(owner, householdId, categoryQuery + "&page=2");
        Assert.Equal(127.5889m, food.ActualAmount);
        Assert.Equal(food.ActualAmount, rootFirst.TotalsByCurrency["CAD"]);
        Assert.Equal(food.ActualAmount, rootFirst.Items.Concat(rootSecond.Items).Sum(t => t.Amount));
        Assert.Contains(rootFirst.Items.Concat(rootSecond.Items), row => row.CategoryId == food.Id);
        Assert.Contains(rootFirst.Items.Concat(rootSecond.Items), row => row.CategoryId == seed.GroceriesId);
        var child = await List(owner, householdId, query + $"&categoryId={seed.GroceriesId}");
        Assert.Equal(food.Children.Single(c => c.Id == seed.GroceriesId).ActualAmount, child.TotalsByCurrency["CAD"]);

        var january = await List(owner, householdId,
            $"budgetInclusion={scope}&currency=CAD&spendingOnly=true&fromDate=2026-01-01&toDate=2026-01-31");
        Assert.Equal(annual.Months.Single(m => m.Month == 1).ActualSpendingAmount, january.TotalsByCurrency["CAD"]);
        var uncategorized = await List(owner, householdId, query + "&uncategorizedOnly=true");
        Assert.Equal(7.5m, Assert.Single(uncategorized.Items).Amount);
        Assert.Equal(annual.UncategorizedSpendingAmount, uncategorized.TotalsByCurrency["CAD"]);

        var csv = await owner.GetStringAsync($"/api/households/{householdId}/transactions/export.csv?{query}&page=2");
        // All matching transactions, not just page 2, and no duplicate rows.
        Assert.Equal(expectedCount + 1, csv.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length);
        Assert.Equal(101, csv.Split("Repeated grocery", StringSplitOptions.None).Length - 1);
        Assert.Contains("-2.3456", csv);
        Assert.DoesNotContain("Not spending", csv);
        Assert.DoesNotContain("SECRET MEMBER NOTES", csv);
        Assert.DoesNotContain("SECRET MEMBER ACCOUNT", csv);
        Assert.DoesNotContain("USD", csv);
    }

    [Fact]
    public async Task Totals_RespectCurrencyPrivacyAdditionalFiltersAndHouseholdAuthorization()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var ownerId = await Register(owner);
        var householdId = await CreateHousehold(owner);
        using var member = factory.CreateAuthenticatedTestClient();
        var memberId = await Register(member);
        await AddMember(householdId, ownerId, memberId);
        var seed = await Seed(householdId, ownerId, memberId);

        var mixed = await List(owner, householdId, "budgetInclusion=Household&spendingOnly=true&fromDate=2026-01-01&toDate=2026-12-31");
        Assert.Equal(2, mixed.TotalsByCurrency.Count);
        Assert.Equal(208.8389m, mixed.TotalsByCurrency["CAD"]);
        Assert.Equal(20m, mixed.TotalsByCurrency["USD"]);
        var income = await List(owner, householdId, "budgetInclusion=Household&currency=CAD&categoryType=Income&fromDate=2026-01-01&toDate=2026-12-31");
        Assert.Equal(-485m, income.TotalsByCurrency["CAD"]); // Signed total, not the income-only report card.
        var refund = await List(owner, householdId, "budgetInclusion=Household&currency=CAD&spendingOnly=true&description=expense%20refund");
        Assert.Equal(-2.3456m, refund.TotalsByCurrency["CAD"]);
        var none = await List(owner, householdId, "budgetInclusion=Household&currency=EUR&spendingOnly=true");
        Assert.Equal(0, none.TotalCount);
        Assert.Empty(none.TotalsByCurrency);
        var outsidePage = await List(owner, householdId, "budgetInclusion=Household&currency=USD&spendingOnly=true&page=10");
        Assert.Empty(outsidePage.Items);
        Assert.Equal(1, outsidePage.TotalCount);
        Assert.Equal(20m, outsidePage.TotalsByCurrency["USD"]);

        // Private transactions contribute only where visible, before totals are computed.
        var otherPersonal = await List(member, householdId,
            "budgetInclusion=Personal&currency=CAD&spendingOnly=true&fromDate=2026-01-01&toDate=2026-12-31");
        Assert.Equal(178m, otherPersonal.TotalsByCurrency["CAD"]); // Their own 123 + their shared 55.
        Assert.DoesNotContain(otherPersonal.Items, row => row.Description == "Owner personal only");
        var privateAccountFilter = await List(owner, householdId, $"accountId={seed.MemberAccountId}&budgetInclusion=Household");
        Assert.Empty(privateAccountFilter.Items);
        Assert.Empty(privateAccountFilter.TotalsByCurrency);
        var household = await List(member, householdId,
            "budgetInclusion=Household&currency=CAD&spendingOnly=true&fromDate=2026-01-01&toDate=2026-12-31");
        Assert.Equal(208.8389m, household.TotalsByCurrency["CAD"]);
        var householdPageTwo = await List(member, householdId,
            "budgetInclusion=Household&currency=CAD&spendingOnly=true&fromDate=2026-01-01&toDate=2026-12-31&page=2");
        var sharedPrivate = household.Items.Concat(householdPageTwo.Items).Single(t => t.Description == "Owner shared rent");
        Assert.Null(sharedPrivate.AccountId);
        Assert.Null(sharedPrivate.Notes);
        var export = await member.GetStringAsync($"/api/households/{householdId}/transactions/export.csv?budgetInclusion=Household&currency=CAD&spendingOnly=true");
        Assert.DoesNotContain("SECRET OWNER NOTES", export);
        Assert.DoesNotContain("SECRET OWNER ACCOUNT", export);
        Assert.DoesNotContain("Owner personal only", export);

        using var outsider = factory.CreateAuthenticatedTestClient();
        await Register(outsider);
        foreach (var path in new[] { "transactions?budgetInclusion=Household", "transactions/export.csv?budgetInclusion=Household", "annual-budget-overview/2026" })
            Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync($"/api/households/{householdId}/{path}")).StatusCode);
        var emptyHousehold = await CreateHousehold(owner);
        Assert.Empty((await List(owner, emptyHousehold, "budgetInclusion=Household")).TotalsByCurrency);
    }

    private async Task<SeedIds> Seed(Guid householdId, Guid ownerId, Guid memberId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var categories = await db.Categories.Where(c => c.HouseholdId == householdId).ToListAsync();
        var food = categories.Single(c => c.Name == "Food & Dining");
        var groceries = categories.Single(c => c.Name == "Groceries");
        var housing = categories.Single(c => c.Name == "Housing");
        var income = categories.First(c => c.Type == CategoryType.Income);
        var now = DateTimeOffset.UtcNow;
        var transfer = Category.CreateRoot(householdId, "Transfer fixture", CategoryType.Transfer, 99, now);
        groceries.Deactivate(now); // Existing historic actuals still reconcile.
        var shared = Account.CreateHousehold(householdId, "Shared CAD", AccountType.Chequing, "CAD", null, null, now);
        var usd = Account.CreateHousehold(householdId, "Shared USD", AccountType.Chequing, "USD", null, null, now);
        var own = Account.CreatePersonal(householdId, ownerId, "SECRET OWNER ACCOUNT", AccountType.Chequing, "CAD", null, null, now);
        var other = Account.CreatePersonal(householdId, memberId, "SECRET MEMBER ACCOUNT", AccountType.Chequing, "CAD", null, null, now);
        db.Categories.Add(transfer);
        db.Accounts.AddRange(shared, usd, own, other);

        Transaction Make(Account account, Guid? categoryId, decimal amount, string description,
            bool household = true, bool personal = true, bool excluded = false, DateOnly? date = null)
        {
            var userId = account.OwnerUserId ?? ownerId;
            var row = Transaction.CreateManual(householdId, account.Id, categoryId, date ?? new DateOnly(2026, 1, 5),
                null, amount, description, null, account.OwnerUserId == memberId ? "SECRET MEMBER NOTES"
                  : account.OwnerUserId == ownerId ? "SECRET OWNER NOTES" : null, excluded, userId, now);
            row.InitializeBudgetInclusion(account.Scope == AccountScope.Household, account.OwnerUserId);
            if (!excluded) row.SetBudgetInclusionForUser(userId, household, personal, now);
            db.Transactions.Add(row);
            return row;
        }
        for (var index = 0; index < 101; index++) Make(shared, groceries.Id, 1.2345m, $"Repeated grocery {index}");
        Make(shared, food.Id, 5.25m, "Direct parent spending");
        Make(shared, groceries.Id, -2.3456m, "Expense refund");
        Make(own, housing.Id, 12.50m, "Owner shared rent");
        Make(own, housing.Id, 8.75m, "Owner personal only", household: false);
        Make(shared, housing.Id, 6.25m, "Household only", personal: false);
        Make(other, housing.Id, 123m, "Member private only", household: false);
        Make(other, housing.Id, 55m, "Member shared expense");
        Make(shared, groceries.Id, 777m, "Not spending excluded", excluded: true);
        Make(shared, groceries.Id, 999m, "Not spending voided").Void(ownerId, now);
        Make(usd, groceries.Id, 20m, "Not spending foreign currency");
        Make(shared, income.Id, -500m, "Not spending income");
        Make(shared, income.Id, 15m, "Not spending income debit");
        Make(shared, null, 7.50m, "Uncategorized spending", date: new DateOnly(2026, 2, 5));
        Make(shared, null, -30m, "Not spending uncategorized income");
        Make(shared, transfer.Id, 13m, "Not spending transfer");
        Make(shared, groceries.Id, 11m, "Not spending next year", date: new DateOnly(2027, 1, 1));
        Make(shared, groceries.Id, 11m, "Not spending previous year", date: new DateOnly(2025, 12, 31));
        await db.SaveChangesAsync();
        return new(food.Id, groceries.Id, other.Id);
    }

    private async Task AddMember(Guid householdId, Guid ownerId, Guid memberId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var household = await db.Households.Include(h => h.Members).SingleAsync(h => h.Id == householdId);
        db.HouseholdMembers.Add(household.AddInvitedMember(memberId, HouseholdRole.Editor, ownerId, DateTimeOffset.UtcNow));
        await db.SaveChangesAsync();
    }
    private static async Task<TransactionListResult> List(HttpClient client, Guid householdId, string query) =>
        (await client.GetFromJsonAsync<TransactionListResult>($"/api/households/{householdId}/transactions?{query}"))!;
    private static async Task<Guid> Register(HttpClient client)
    {
        var result = await Send(client, "/api/auth/register", new {
            email = $"drill-down-{Guid.NewGuid():N}@example.test", password = "a long test password", displayName = "Test"
        });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        return (await client.GetFromJsonAsync<IdResult>("/api/auth/me"))!.Id;
    }
    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var result = await Send(client, "/api/households", new {
            name = "Drill-down test", defaultCurrency = "CAD", timeZoneId = "America/Vancouver"
        });
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        return (await result.Content.ReadFromJsonAsync<IdResult>())!.Id;
    }
    private static async Task<HttpResponseMessage> Send(HttpClient client, string path, object body)
    {
        var token = (await client.GetFromJsonAsync<TokenResult>("/api/auth/antiforgery"))!.Token;
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return await client.SendAsync(request);
    }
    private sealed record TokenResult(string Token);
    private sealed record IdResult(Guid Id);
    private sealed record SeedIds(Guid FoodId, Guid GroceriesId, Guid MemberAccountId);
}
