using System.Net;
using System.Net.Http.Json;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class TransactionManagementTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Transactions_WithoutAuthentication_ReturnUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await client.GetAsync(TransactionPath(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_CanListVisibleTransactionsAndEditOne()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        var seeded = await SeedTransactions(householdId, userId);

        var result = await client.GetFromJsonAsync<TransactionListResponse>(
            TransactionPath(householdId));

        Assert.NotNull(result);
        Assert.False(result.HasMore);
        Assert.Equal(2, result.Items.Count);
        Assert.Contains(result.Items, item => item.Id == seeded.HouseholdTransactionId);
        Assert.Contains(result.Items, item => item.Id == seeded.PersonalTransactionId);
        Assert.DoesNotContain(result.Items, item => item.Id == seeded.OtherUsersTransactionId);
        Assert.All(result.Items, item => Assert.True(item.CanEdit));

        var updateResponse = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"{TransactionPath(householdId)}/{seeded.HouseholdTransactionId}",
            new
            {
                categoryId = seeded.CategoryId,
                transactionDate = "2026-07-21",
                postedDate = "2026-07-22",
                amount = -54.75m,
                description = "Corrected groceries",
                merchantName = "Example Market",
                notes = "Receipt checked",
                isExcludedFromBudget = true
            },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.NoContent, updateResponse.StatusCode);

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var updated = await dbContext.Transactions.AsNoTracking().SingleAsync(
            transaction => transaction.Id == seeded.HouseholdTransactionId);
        Assert.Equal(new DateOnly(2026, 7, 21), updated.TransactionDate);
        Assert.Equal(new DateOnly(2026, 7, 22), updated.PostedDate);
        Assert.Equal(-54.75m, updated.Amount);
        Assert.Equal("Corrected groceries", updated.Description);
        Assert.Equal("Example Market", updated.MerchantName);
        Assert.Equal("Receipt checked", updated.Notes);
        Assert.True(updated.IsExcludedFromBudget);
        Assert.Equal(userId, updated.LastModifiedByUserId);
    }

    [Fact]
    public async Task List_FiltersByParentCategoryDescriptionAndPagesResults()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        var (accountId, foodCategoryId) = await SeedSearchTransactions(
            householdId,
            userId);

        var firstPage = await client.GetFromJsonAsync<TransactionListResponse>(
            $"{TransactionPath(householdId)}?accountId={accountId}&page=1");
        Assert.NotNull(firstPage);
        Assert.Equal(100, firstPage.Items.Count);
        Assert.True(firstPage.HasMore);
        Assert.Equal(1, firstPage.Page);
        Assert.Equal(100, firstPage.PageSize);
        Assert.Equal(105, firstPage.TotalCount);
        Assert.Equal(2, firstPage.TotalPages);

        var secondPage = await client.GetFromJsonAsync<TransactionListResponse>(
            $"{TransactionPath(householdId)}?accountId={accountId}&page=2");
        Assert.NotNull(secondPage);
        Assert.Equal(5, secondPage.Items.Count);
        Assert.False(secondPage.HasMore);

        var filtered = await client.GetFromJsonAsync<TransactionListResponse>(
            $"{TransactionPath(householdId)}?categoryType=Expense" +
            $"&categoryId={foodCategoryId}&description=market" +
            "&fromDate=2026-01-01&toDate=2026-01-31&page=1");
        Assert.NotNull(filtered);
        var match = Assert.Single(filtered.Items);
        Assert.Equal("Corner MARKET", match.Description);
    }

    private async Task<(Guid AccountId, Guid FoodCategoryId)> SeedSearchTransactions(
        Guid householdId,
        Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var foodCategory = await dbContext.Categories.SingleAsync(category =>
            category.HouseholdId == householdId && category.Name == "Food & Dining");
        var groceries = await dbContext.Categories.SingleAsync(category =>
            category.HouseholdId == householdId && category.Name == "Groceries");
        var now = DateTimeOffset.UtcNow;
        var account = Account.CreateHousehold(
            householdId,
            "Search Chequing",
            AccountType.Chequing,
            "CAD",
            null,
            null,
            now);
        dbContext.Accounts.Add(account);

        for (var index = 0; index < 105; index++)
        {
            dbContext.Transactions.Add(Transaction.CreateManual(
                householdId,
                account.Id,
                groceries.Id,
                new DateOnly(2026, 1, 1).AddDays(index),
                null,
                -(index + 1),
                index == 0 ? "Corner MARKET" : $"Search purchase {index:000}",
                null,
                null,
                false,
                userId,
                now));
        }

        await dbContext.SaveChangesAsync();
        return (account.Id, foodCategory.Id);
    }

    private async Task<SeededTransactions> SeedTransactions(Guid householdId, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var categoryId = await dbContext.Categories
            .Where(category => category.HouseholdId == householdId && category.IsActive)
            .Select(category => category.Id)
            .FirstAsync();
        var otherUserId = Guid.NewGuid();
        dbContext.Users.Add(new ApplicationUser
        {
            Id = otherUserId,
            DisplayName = "Other Transaction Owner",
            Email = $"other-transaction-{otherUserId:N}@example.test",
            NormalizedEmail = $"OTHER-TRANSACTION-{otherUserId:N}@EXAMPLE.TEST",
            UserName = $"other-transaction-{otherUserId:N}@example.test",
            NormalizedUserName = $"OTHER-TRANSACTION-{otherUserId:N}@EXAMPLE.TEST"
        });

        var now = DateTimeOffset.UtcNow;
        var householdAccount = Account.CreateHousehold(
            householdId,
            "Joint Chequing",
            AccountType.Chequing,
            "CAD",
            null,
            null,
            now);
        var personalAccount = Account.CreatePersonal(
            householdId,
            userId,
            "My Card",
            AccountType.CreditCard,
            "CAD",
            null,
            null,
            now);
        var otherAccount = Account.CreatePersonal(
            householdId,
            otherUserId,
            "Other Private Card",
            AccountType.CreditCard,
            "CAD",
            null,
            null,
            now);
        dbContext.Accounts.AddRange(householdAccount, personalAccount, otherAccount);

        var householdTransaction = CreateTransaction(
            householdId, householdAccount.Id, categoryId, userId, "Shared groceries", now);
        var personalTransaction = CreateTransaction(
            householdId, personalAccount.Id, categoryId, userId, "Personal purchase", now);
        var otherTransaction = CreateTransaction(
            householdId, otherAccount.Id, categoryId, otherUserId, "Other private purchase", now);
        dbContext.Transactions.AddRange(
            householdTransaction,
            personalTransaction,
            otherTransaction);
        await dbContext.SaveChangesAsync();

        return new SeededTransactions(
            householdTransaction.Id,
            personalTransaction.Id,
            otherTransaction.Id,
            categoryId);
    }

    private static Transaction CreateTransaction(
        Guid householdId,
        Guid accountId,
        Guid categoryId,
        Guid userId,
        string description,
        DateTimeOffset now) =>
        Transaction.CreateManual(
            householdId,
            accountId,
            categoryId,
            new DateOnly(2026, 7, 20),
            null,
            -25m,
            description,
            null,
            null,
            false,
            userId,
            now);

    private static string TransactionPath(Guid householdId) =>
        $"/api/households/{householdId}/transactions";

    private static async Task<Guid> Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"transactions-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Transaction Test"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var currentUser = await client.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        return currentUser?.Id ?? throw new InvalidOperationException("Current user ID was missing.");
    }

    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/households",
            new
            {
                name = "Transaction API Household",
                defaultCurrency = "CAD",
                timeZoneId = "America/Vancouver"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<CreateHouseholdResponse>();
        return created?.Id ?? throw new InvalidOperationException("Household ID was missing.");
    }

    private static async Task<string> GetAntiforgeryToken(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/antiforgery");
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        return result?.Token ?? throw new InvalidOperationException("Antiforgery token was missing.");
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

    private sealed record SeededTransactions(
        Guid HouseholdTransactionId,
        Guid PersonalTransactionId,
        Guid OtherUsersTransactionId,
        Guid CategoryId);

    private sealed record TransactionListResponse(
        IReadOnlyList<TransactionResponse> Items,
        bool HasMore,
        int Page,
        int PageSize,
        int TotalCount,
        int TotalPages);

    private sealed record TransactionResponse(Guid Id, bool CanEdit, string Description);
    private sealed record AntiforgeryTokenResponse(string Token);
    private sealed record CreateHouseholdResponse(Guid Id);
    private sealed record CurrentUserResponse(Guid Id);
}
