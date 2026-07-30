using System.Net;
using System.Net.Http.Json;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class TransactionCsvExportTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Export_WithoutAuthentication_ReturnsUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await client.GetAsync(ExportPath(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Export_ForHouseholdWithoutMembership_ReturnsForbidden()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var response = await client.GetAsync(ExportPath(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Owner_ExportsOnlyVisibleTransactionsAsSafeReadableCsv()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        await SeedExportTransactions(householdId, userId);

        var response = await client.GetAsync(ExportPath(householdId));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        var downloadName =
            response.Content.Headers.ContentDisposition?.FileNameStar ??
            response.Content.Headers.ContentDisposition?.FileName;
        Assert.Contains("budgetapp-transactions-", downloadName);
        Assert.EndsWith(".csv", downloadName);

        var csv = await response.Content.ReadAsStringAsync();
        Assert.Contains(
            "Transaction Date,Description,Amount,Currency,Account,Category," +
            "Subcategory,Budget Treatment,Notes",
            csv);
        Assert.Contains("\"'=SUM(1,1)\"", csv);
        Assert.Contains("'@Formula Note", csv);
        Assert.Contains(
            "25.5,CAD,Shared Chequing,Food & Dining,Groceries",
            csv);
        Assert.Contains("Personal Card", csv);
        Assert.Contains(",Included,", csv);
        Assert.Contains("Personal purchase", csv);
        Assert.DoesNotContain("Other private purchase", csv);
        Assert.DoesNotContain("Other Private Card", csv);
    }

    [Fact]
    public async Task Export_AppliesTheCurrentTransactionSearchFilters()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        var seeded = await SeedExportTransactions(householdId, userId);

        var path = ExportPath(householdId) +
            $"?accountId={seeded.SharedAccountId}" +
            $"&categoryId={seeded.GroceriesCategoryId}" +
            "&fromDate=2026-07-20&toDate=2026-07-20" +
            "&description=SUM";
        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var csv = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"'=SUM(1,1)\"", csv);
        Assert.DoesNotContain("Personal purchase", csv);
        Assert.DoesNotContain("Other private purchase", csv);
    }

    private async Task<SeededExport> SeedExportTransactions(Guid householdId, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var groceries = await dbContext.Categories.SingleAsync(category =>
            category.HouseholdId == householdId && category.Name == "Groceries");
        var otherUserId = Guid.NewGuid();
        dbContext.Users.Add(new ApplicationUser
        {
            Id = otherUserId,
            DisplayName = "Other Export User",
            Email = $"other-export-{otherUserId:N}@example.test",
            NormalizedEmail = $"OTHER-EXPORT-{otherUserId:N}@EXAMPLE.TEST",
            UserName = $"other-export-{otherUserId:N}@example.test",
            NormalizedUserName = $"OTHER-EXPORT-{otherUserId:N}@EXAMPLE.TEST"
        });

        var now = DateTimeOffset.UtcNow;
        var sharedAccount = Account.CreateHousehold(
            householdId,
            "Shared Chequing",
            AccountType.Chequing,
            "CAD",
            null,
            null,
            now);
        var personalAccount = Account.CreatePersonal(
            householdId,
            userId,
            "Personal Card",
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
        dbContext.Accounts.AddRange(sharedAccount, personalAccount, otherAccount);

        dbContext.Transactions.AddRange(
            Transaction.CreateManual(
                householdId,
                sharedAccount.Id,
                groceries.Id,
                new DateOnly(2026, 7, 20),
                new DateOnly(2026, 7, 21),
                25.50m,
                "=SUM(1,1)",
                "+Formula Merchant",
                "@Formula Note",
                false,
                userId,
                now),
            Transaction.CreateManual(
                householdId,
                personalAccount.Id,
                groceries.Id,
                new DateOnly(2026, 7, 22),
                null,
                10m,
                "Personal purchase",
                null,
                null,
                false,
                userId,
                now),
            Transaction.CreateManual(
                householdId,
                otherAccount.Id,
                groceries.Id,
                new DateOnly(2026, 7, 23),
                null,
                30m,
                "Other private purchase",
                null,
                null,
                false,
                otherUserId,
                now));

        await dbContext.SaveChangesAsync();
        return new SeededExport(sharedAccount.Id, groceries.Id);
    }

    private static string ExportPath(Guid householdId) =>
        $"/api/households/{householdId}/transactions/export.csv";

    private static async Task<Guid> Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"transaction-export-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Transaction Export Test"
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
                name = "Transaction Export Household",
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

    private sealed record AntiforgeryTokenResponse(string Token);
    private sealed record CreateHouseholdResponse(Guid Id);
    private sealed record CurrentUserResponse(Guid Id);
    private sealed record SeededExport(Guid SharedAccountId, Guid GroceriesCategoryId);
}
