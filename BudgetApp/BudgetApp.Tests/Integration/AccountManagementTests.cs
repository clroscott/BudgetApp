using System.Net;
using System.Net.Http.Json;
using BudgetApp.Domain.Accounts;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class AccountManagementTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Accounts_WithoutAuthentication_ReturnUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var householdId = Guid.NewGuid();

        var listResponse = await client.GetAsync(AccountPath(householdId));
        var createResponse = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            AccountPath(householdId),
            CreateAccountRequest(),
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Unauthorized, listResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, createResponse.StatusCode);
    }

    [Fact]
    public async Task Accounts_ForAnotherHousehold_ReturnForbidden()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        var response = await client.GetAsync(AccountPath(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Owner_CanManageVisibleHouseholdAndPersonalAccounts()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var currentUserId = await Register(client);
        var householdId = await CreateHousehold(client);
        var token = await GetAntiforgeryToken(client);

        var householdAccountId = await CreateAccount(
            client,
            householdId,
            CreateAccountRequest(),
            token);
        var personalAccountId = await CreateAccount(
            client,
            householdId,
            CreateAccountRequest(
                name: "My Savings",
                type: "Savings",
                scope: "Personal",
                currency: "USD",
                institutionName: null,
                lastFourDigits: null),
            token);
        await AddAnotherUsersPersonalAccount(householdId);

        var visible = await GetAccounts(client, householdId);
        Assert.Equal(2, visible.Count);
        Assert.DoesNotContain(visible, account => account.Name == "Private Other Account");

        var shared = Assert.Single(
            visible,
            account => account.Id == householdAccountId);
        Assert.Equal("Household", shared.Scope);
        Assert.Null(shared.OwnerUserId);
        Assert.Equal("CAD", shared.Currency);
        Assert.Equal("1234", shared.LastFourDigits);

        var personal = Assert.Single(
            visible,
            account => account.Id == personalAccountId);
        Assert.Equal("Personal", personal.Scope);
        Assert.Equal(currentUserId, personal.OwnerUserId);
        Assert.Equal("USD", personal.Currency);

        var updateResponse = await SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"{AccountPath(householdId)}/{personalAccountId}",
            new
            {
                name = "Emergency Savings",
                type = "Savings",
                scope = "Household",
                currency = "USD",
                institutionName = "Example Bank",
                lastFourDigits = "9876"
            },
            token);
        Assert.Equal(HttpStatusCode.NoContent, updateResponse.StatusCode);

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SetActive(
                client,
                householdId,
                householdAccountId,
                isActive: false,
                token)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SetActive(
                client,
                householdId,
                householdAccountId,
                isActive: true,
                token)).StatusCode);

        var final = await GetAccounts(client, householdId);
        var updatedPersonal = Assert.Single(
            final,
            account => account.Id == personalAccountId);
        Assert.Equal("Emergency Savings", updatedPersonal.Name);
        Assert.Equal("Household", updatedPersonal.Scope);
        Assert.Null(updatedPersonal.OwnerUserId);
        Assert.Equal("USD", updatedPersonal.Currency);
        Assert.Equal("Example Bank", updatedPersonal.InstitutionName);
        Assert.Equal("9876", updatedPersonal.LastFourDigits);
        Assert.True(Assert.Single(
            final,
            account => account.Id == householdAccountId).IsActive);
    }

    [Theory]
    [InlineData("Unknown", "Household")]
    [InlineData("Chequing", "Unknown")]
    public async Task Create_WithUnsupportedTypeOrScope_ReturnsBadRequest(
        string type,
        string scope)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);

        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            AccountPath(householdId),
            CreateAccountRequest(type: type, scope: scope),
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await GetAccounts(client, householdId));
    }

    [Fact]
    public async Task Create_WithUnsupportedCurrency_ReturnsBadRequest()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);

        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            AccountPath(householdId),
            CreateAccountRequest(currency: "ZZZ"),
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await GetAccounts(client, householdId));
    }

    private async Task AddAnotherUsersPersonalAccount(Guid householdId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var otherUserId = Guid.NewGuid();
        dbContext.Users.Add(new ApplicationUser
        {
            Id = otherUserId,
            DisplayName = "Other Account Owner",
            Email = $"other-account-{otherUserId:N}@example.test",
            NormalizedEmail = $"OTHER-ACCOUNT-{otherUserId:N}@EXAMPLE.TEST",
            UserName = $"other-account-{otherUserId:N}@example.test",
            NormalizedUserName = $"OTHER-ACCOUNT-{otherUserId:N}@EXAMPLE.TEST"
        });
        dbContext.Accounts.Add(Account.CreatePersonal(
            householdId,
            otherUserId,
            "Private Other Account",
            AccountType.Other,
            "CAD",
            null,
            null,
            DateTimeOffset.UtcNow));
        await dbContext.SaveChangesAsync();
    }

    private static object CreateAccountRequest(
        string name = "Joint Chequing",
        string type = "Chequing",
        string scope = "Household",
        string currency = "CAD",
        string? institutionName = "Example Credit Union",
        string? lastFourDigits = "1234") =>
        new { name, type, scope, currency, institutionName, lastFourDigits };

    private static string AccountPath(Guid householdId) =>
        $"/api/households/{householdId}/accounts";

    private static async Task<IReadOnlyList<AccountResponse>> GetAccounts(
        HttpClient client,
        Guid householdId) =>
        await client.GetFromJsonAsync<AccountResponse[]>(AccountPath(householdId)) ?? [];

    private static async Task<Guid> CreateAccount<TRequest>(
        HttpClient client,
        Guid householdId,
        TRequest body,
        string token)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            AccountPath(householdId),
            body,
            token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<CreateAccountResponse>();
        return created?.Id ?? throw new InvalidOperationException(
            "The account endpoint did not return an ID.");
    }

    private static Task<HttpResponseMessage> SetActive(
        HttpClient client,
        Guid householdId,
        Guid accountId,
        bool isActive,
        string token) =>
        SendWithAntiforgery(
            client,
            HttpMethod.Post,
            $"{AccountPath(householdId)}/{accountId}/{(isActive ? "reactivate" : "archive")}",
            new { },
            token);

    private static async Task<Guid> Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"accounts-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Account Test"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var currentUser = await client.GetFromJsonAsync<CurrentUserResponse>(
            "/api/auth/me");
        return currentUser?.Id ?? throw new InvalidOperationException(
            "The current-user endpoint did not return an ID.");
    }

    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/households",
            new
            {
                name = "Account Test Household",
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
    private sealed record CreateAccountResponse(Guid Id);
    private sealed record CreateHouseholdResponse(Guid Id);
    private sealed record CurrentUserResponse(Guid Id);
    private sealed record AccountResponse(
        Guid Id,
        string Name,
        string Type,
        string Scope,
        Guid? OwnerUserId,
        string Currency,
        string? InstitutionName,
        string? LastFourDigits,
        bool IsActive);
}
