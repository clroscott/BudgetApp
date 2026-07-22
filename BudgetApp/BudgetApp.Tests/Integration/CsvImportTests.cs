using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
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
            "Date,Description,Amount,Category,Subcategory\n" +
            "2026-07-20,\"Market, Main Street\",-47.25,Food & Dining,Groceries\n" +
            "not-a-date,Needs correction,12.34,,\n" +
            "2026-07-21,Payroll,1250.00,Income,Paycheque\n";

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
        Assert.Equal(ImportDraftDuplicateStatus.NoMatch, drafts[0].DuplicateStatus);
        var groceries = await dbContext.Categories.SingleAsync(category =>
            category.HouseholdId == householdId && category.Name == "Groceries");
        Assert.Equal(groceries.Id, drafts[0].SuggestedCategoryId);
        Assert.Equal(groceries.Id, drafts[0].SelectedCategoryId);
        Assert.False(await dbContext.Transactions.AnyAsync(
            transaction => transaction.ImportFileId == result.ImportFileId));

        var review = await client.GetFromJsonAsync<ImportReviewResponse>(
            $"/api/households/{householdId}/imports/{result.ImportFileId}");
        Assert.NotNull(review);
        var firstRow = review.Drafts.Single(row => row.SourceRowNumber == 2);
        Assert.Equal("Food & Dining", firstRow.ImportedCategoryName);
        Assert.Equal("Groceries", firstRow.ImportedSubcategoryName);
        Assert.Equal(groceries.Id, firstRow.SelectedCategoryId);

        var discard = await DeleteWithAntiforgery(
            client,
            $"/api/households/{householdId}/imports/{result.ImportFileId}",
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.NoContent, discard.StatusCode);
        dbContext.ChangeTracker.Clear();
        Assert.False(await dbContext.ImportFiles.AnyAsync(
            importFile => importFile.Id == result.ImportFileId));
        Assert.False(await dbContext.ImportTransactionDrafts.AnyAsync(
            draft => draft.ImportFileId == result.ImportFileId));
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

    [Fact]
    public async Task Review_CorrectsDecidesAndCompletesRowsIdempotently()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await Register(client);
        var householdId = await CreateHousehold(client);
        var accountId = await CreateAccount(client, householdId);
        await AddExistingTransaction(householdId, accountId, userId);
        const string csv =
            "Date,Description,Amount\n" +
            "2026-07-20,Existing purchase,-25.00\n" +
            "2026-07-21,Do not import,-15.00\n" +
            "bad-date,Correct me,-30.00\n";

        var upload = await Upload(
            client,
            householdId,
            accountId,
            csv,
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
        var uploaded = await upload.Content.ReadFromJsonAsync<CsvImportResponse>();
        Assert.NotNull(uploaded);
        Assert.Equal(1, uploaded.DuplicateRows);

        var imports = await client.GetFromJsonAsync<ImportListResponse[]>(
            $"/api/households/{householdId}/imports");
        Assert.NotNull(imports);
        Assert.Contains(imports, item => item.Id == uploaded.ImportFileId);

        var review = await client.GetFromJsonAsync<ImportReviewResponse>(
            $"/api/households/{householdId}/imports/{uploaded.ImportFileId}");
        Assert.NotNull(review);
        Assert.Equal(3, review.Drafts.Count);
        var duplicate = review.Drafts.Single(row => row.SourceRowNumber == 2);
        var rejected = review.Drafts.Single(row => row.SourceRowNumber == 3);
        var corrected = review.Drafts.Single(row => row.SourceRowNumber == 4);
        Assert.Equal("PossibleDuplicate", duplicate.DuplicateStatus);
        Assert.Equal("Invalid", corrected.ValidationStatus);

        var unacknowledged = await PostJson(
            client,
            DecisionPath(householdId, uploaded.ImportFileId, duplicate.Id),
            new { decision = "Approved", acknowledgePossibleDuplicate = false },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.BadRequest, unacknowledged.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await PostJson(
            client,
            DecisionPath(householdId, uploaded.ImportFileId, duplicate.Id),
            new { decision = "Approved", acknowledgePossibleDuplicate = true },
            await GetAntiforgeryToken(client))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PostJson(
            client,
            DecisionPath(householdId, uploaded.ImportFileId, rejected.Id),
            new { decision = "Rejected", acknowledgePossibleDuplicate = false },
            await GetAntiforgeryToken(client))).StatusCode);

        var correction = await PutJson(
            client,
            $"/api/households/{householdId}/imports/{uploaded.ImportFileId}/drafts/{corrected.Id}",
            new
            {
                transactionDate = "2026-07-22",
                amount = -30m,
                description = "Corrected purchase",
                selectedCategoryId = (Guid?)null
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.NoContent, correction.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PostJson(
            client,
            DecisionPath(householdId, uploaded.ImportFileId, corrected.Id),
            new { decision = "Approved", acknowledgePossibleDuplicate = false },
            await GetAntiforgeryToken(client))).StatusCode);

        var completed = await PostJson(
            client,
            $"/api/households/{householdId}/imports/{uploaded.ImportFileId}/complete",
            new { },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        var completion = await completed.Content.ReadFromJsonAsync<CompleteImportResponse>();
        Assert.NotNull(completion);
        Assert.Equal(2, completion.CreatedTransactionCount);
        Assert.Equal("Completed", completion.Status);

        var retry = await PostJson(
            client,
            $"/api/households/{householdId}/imports/{uploaded.ImportFileId}/complete",
            new { },
            await GetAntiforgeryToken(client));
        var retryResult = await retry.Content.ReadFromJsonAsync<CompleteImportResponse>();
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.NotNull(retryResult);
        Assert.Equal(0, retryResult.CreatedTransactionCount);

        var discardCompleted = await DeleteWithAntiforgery(
            client,
            $"/api/households/{householdId}/imports/{uploaded.ImportFileId}",
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.BadRequest, discardCompleted.StatusCode);

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var imported = await dbContext.Transactions
            .Where(transaction => transaction.ImportFileId == uploaded.ImportFileId)
            .ToListAsync();
        Assert.Equal(2, imported.Count);
        Assert.Contains(imported, transaction => transaction.Description == "Existing purchase");
        Assert.Contains(imported, transaction => transaction.Description == "Corrected purchase");
        Assert.DoesNotContain(imported, transaction => transaction.Description == "Do not import");
    }

    private async Task AddExistingTransaction(Guid householdId, Guid accountId, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        dbContext.Transactions.Add(Transaction.CreateManual(
            householdId,
            accountId,
            categoryId: null,
            new DateOnly(2026, 7, 20),
            postedDate: null,
            -25m,
            "Existing purchase",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            userId,
            DateTimeOffset.UtcNow));
        await dbContext.SaveChangesAsync();
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

    private static async Task<Guid> Register(HttpClient client)
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
        var currentUser = await client.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        return currentUser?.Id ?? throw new InvalidOperationException(
            "The current-user endpoint did not return an ID.");
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

    private static Task<HttpResponseMessage> PutJson<TRequest>(
        HttpClient client,
        string path,
        TRequest body,
        string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> DeleteWithAntiforgery(
        HttpClient client,
        string path,
        string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, path);
        request.Headers.Add("X-XSRF-TOKEN", token);
        return client.SendAsync(request);
    }

    private static string DecisionPath(Guid householdId, Guid importFileId, Guid draftId) =>
        $"/api/households/{householdId}/imports/{importFileId}/drafts/{draftId}/decision";

    private sealed record AntiforgeryResponse(string Token);
    private sealed record CreatedResponse(Guid Id);
    private sealed record CurrentUserResponse(Guid Id);
    private sealed record CsvImportResponse(
        Guid ImportFileId,
        string OriginalFileName,
        string AccountName,
        string Status,
        int TotalRows,
        int ValidRows,
        int InvalidRows,
        int DuplicateRows);
    private sealed record ImportReviewResponse(IReadOnlyList<ImportDraftResponse> Drafts);
    private sealed record ImportListResponse(Guid Id);
    private sealed record ImportDraftResponse(
        Guid Id,
        int SourceRowNumber,
        string ValidationStatus,
        string DuplicateStatus,
        string? ImportedCategoryName,
        string? ImportedSubcategoryName,
        Guid? SelectedCategoryId);
    private sealed record CompleteImportResponse(
        int CreatedTransactionCount,
        string Status);
}
