using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using BudgetApp.Domain.Imports;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class CsvImportTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Upload_WithoutAuthentication_ReturnsUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await Upload(
            client,
            Guid.NewGuid(),
            Guid.NewGuid(),
            "Date,Description,Amount\n2026-07-20,Groceries,-10\n",
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Upload_StagesRowsWithoutCreatingTransactions()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var accountId = await CreateAccount(client, householdId);
        const string csv =
            "Date,Description,Amount\n" +
            "2026-07-20,\"Market, Main Street\",-47.25\n" +
            "not-a-date,Needs correction,12.34\n" +
            "2026-07-21,Payroll,1250.00\n";

        var response = await Upload(
            client,
            householdId,
            accountId,
            csv,
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<CsvImportResponse>();
        Assert.NotNull(result);
        Assert.Equal("transactions.csv", result.OriginalFileName);
        Assert.Equal("Joint Chequing", result.AccountName);
        Assert.Equal("ReadyForReview", result.Status);
        Assert.Equal(3, result.TotalRows);
        Assert.Equal(2, result.ValidRows);
        Assert.Equal(1, result.InvalidRows);

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var savedImport = await dbContext.ImportFiles.SingleAsync(
            importFile => importFile.Id == result.ImportFileId);
        var drafts = await dbContext.ImportTransactionDrafts
            .Where(draft => draft.ImportFileId == result.ImportFileId)
            .OrderBy(draft => draft.SourceRowNumber)
            .ToListAsync();

        Assert.Equal(ImportFileStatus.ReadyForReview, savedImport.Status);
        Assert.Equal(3, drafts.Count);
        Assert.Equal("Market, Main Street", drafts[0].OriginalDescription);
        Assert.Equal(ImportDraftValidationStatus.Valid, drafts[0].ValidationStatus);
        Assert.Equal(ImportDraftValidationStatus.Invalid, drafts[1].ValidationStatus);
        Assert.Equal(ImportDraftDuplicateStatus.NotChecked, drafts[0].DuplicateStatus);
        Assert.False(await dbContext.Transactions.AnyAsync(
            transaction => transaction.ImportFileId == result.ImportFileId));
    }

    [Fact]
    public async Task Upload_WithUnknownLayout_ReturnsBadRequestWithoutStagingFile()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var accountId = await CreateAccount(client, householdId);

        var response = await Upload(
            client,
            householdId,
            accountId,
            "When,What,Value\n2026-07-20,Groceries,-10\n",
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.False(await dbContext.ImportFiles.AnyAsync(
            importFile => importFile.HouseholdId == householdId));
    }

    [Fact]
    public async Task UploadingSameFileTwice_RequiresExplicitConfirmation()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);
        var householdId = await CreateHousehold(client);
        var accountId = await CreateAccount(client, householdId);
        const string csv =
            "Date,Description,Amount\n2026-07-20,Groceries,-10\n";

        var first = await Upload(
            client,
            householdId,
            accountId,
            csv,
            await GetAntiforgeryToken(client));
        var duplicate = await Upload(
            client,
            householdId,
            accountId,
            csv,
            await GetAntiforgeryToken(client));
        var confirmed = await Upload(
            client,
            householdId,
            accountId,
            csv,
            await GetAntiforgeryToken(client),
            allowDuplicateFile: true);

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal(HttpStatusCode.Created, confirmed.StatusCode);
    }

    private static async Task<HttpResponseMessage> Upload(
        HttpClient client,
        Guid householdId,
        Guid accountId,
        string csv,
        string token,
        bool allowDuplicateFile = false)
    {
        var content = new MultipartFormDataContent();
        content.Add(new StringContent(accountId.ToString()), "accountId");
        content.Add(
            new StringContent(allowDuplicateFile.ToString()),
            "allowDuplicateFile");
        var fileContent = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(fileContent, "file", "transactions.csv");

        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/households/{householdId}/imports")
        {
            Content = content
        };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return await client.SendAsync(request);
    }

    private static async Task Register(HttpClient client)
    {
        var response = await PostJson(
            client,
            "/api/auth/register",
            new
            {
                email = $"csv-import-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "CSV Import Test"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var response = await PostJson(
            client,
            "/api/households",
            new
            {
                name = $"Import Test {Guid.NewGuid():N}",
                defaultCurrency = "CAD",
                timeZoneId = "America/Vancouver"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<CreatedResponse>();
        return created?.Id ?? throw new InvalidOperationException(
            "The household endpoint did not return an ID.");
    }

    private static async Task<Guid> CreateAccount(
        HttpClient client,
        Guid householdId)
    {
        var response = await PostJson(
            client,
            $"/api/households/{householdId}/accounts",
            new
            {
                name = "Joint Chequing",
                type = "Chequing",
                scope = "Household",
                currency = "CAD",
                institutionName = "Example Bank",
                lastFourDigits = "1234"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<CreatedResponse>();
        return created?.Id ?? throw new InvalidOperationException(
            "The account endpoint did not return an ID.");
    }

    private static async Task<string> GetAntiforgeryToken(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/antiforgery");
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<AntiforgeryResponse>();
        return token?.Token ?? throw new InvalidOperationException(
            "The antiforgery endpoint did not return a token.");
    }

    private static Task<HttpResponseMessage> PostJson<TRequest>(
        HttpClient client,
        string path,
        TRequest body,
        string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return client.SendAsync(request);
    }

    private sealed record AntiforgeryResponse(string Token);
    private sealed record CreatedResponse(Guid Id);
    private sealed record CsvImportResponse(
        Guid ImportFileId,
        string OriginalFileName,
        string AccountName,
        string Status,
        int TotalRows,
        int ValidRows,
        int InvalidRows,
        int DuplicateRows);
}
