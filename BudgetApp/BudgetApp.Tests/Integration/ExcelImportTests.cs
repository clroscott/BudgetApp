using System.Net;
using System.Net.Http.Json;
using System.Text;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static BudgetApp.Tests.Infrastructure.Imports.XlsxTestWorkbook;

namespace BudgetApp.Tests.Integration;

public sealed class ExcelImportTests(BudgetAppWebApplicationFactory factory) : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task WorksheetSelection_StagesOnlyOneSheetAndDuplicateFileIdentityIncludesSheet()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var (_, household, account) = await Setup(client);
        var bytes = Create(new Sheet("First", StandardRows("First", firstRow: 7)), new Sheet("Second", StandardRows("Second", firstRow: 10)));
        var before = await FileRequest(client, household, account, bytes, inspect: true);
        Assert.Equal(HttpStatusCode.OK, before.StatusCode);
        var inspection = (await before.Content.ReadFromJsonAsync<ImportProfileInspectionModel>())!;
        Assert.Null(inspection.SelectedWorksheetId); Assert.Equal(2, inspection.Worksheets!.Count);
        Assert.Equal(HttpStatusCode.BadRequest, (await FileRequest(client, household, account, bytes)).StatusCode);
        var selected = (await (await FileRequest(client, household, account, bytes, "2", inspect: true)).Content.ReadFromJsonAsync<ImportProfileInspectionModel>())!;
        Assert.Equal([11], selected.PreviewRowNumbers); Assert.Equal("Second", selected.SelectedWorksheetName);
        var staged = await FileRequest(client, household, account, bytes, "2");
        Assert.Equal(HttpStatusCode.Created, staged.StatusCode);
        var result = (await staged.Content.ReadFromJsonAsync<TransactionImportResult>())!;
        Assert.Equal("Second", result.SourceWorksheetName); Assert.Equal(1, result.TotalRows);
        var detail = (await client.GetFromJsonAsync<ImportReviewDetail>($"/api/households/{household}/imports/{result.ImportFileId}"))!;
        Assert.Equal("Second", detail.SourceWorksheetName); Assert.Equal(11, Assert.Single(detail.Drafts).SourceRowNumber);
        Assert.Equal(HttpStatusCode.Conflict, (await FileRequest(client, household, account, bytes, "2")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await FileRequest(client, household, account, bytes, "1")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await FileRequest(client, household, account, bytes, "2", allowDuplicate: true)).StatusCode);
        var list = (await client.GetFromJsonAsync<ImportListResult>($"/api/households/{household}/imports"))!;
        Assert.Equal(3, list.Items.Count);
        Assert.Contains(list.Items, item => item.SourceWorksheetName == "First");
        Assert.Equal(2, list.Items.Count(item => item.SourceWorksheetName == "Second"));
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(3, await db.ImportFiles.CountAsync(f => f.HouseholdId == household));
        Assert.Equal(3, await db.ImportTransactionDrafts.CountAsync(d => db.ImportFiles.Any(f => f.Id == d.ImportFileId && f.HouseholdId == household)));
        Assert.False(await db.Transactions.AnyAsync(t => t.HouseholdId == household));
    }

    [Fact]
    public async Task SharedProfiles_LocalizedValuesCategoryRulesAndCrossFormatDuplicatesReuseReviewAndCompletion()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var (_, household, account) = await Setup(client);
        var profileResponse = await TestIdentity.Post(client, $"/api/households/{household}/import-profiles", new {
            name = "Localized bank", headers = new[] { "When", "Vendor", "Value", "Category", "Subcategory" },
            dateColumn = "When", descriptionColumn = "Vendor", amountColumn = "Value", categoryColumn = "Category", subcategoryColumn = "Subcategory",
            amountConvention = "SpendingPositive", defaultAccountId = account, dateFormat = "dd/MM/yyyy", numberCulture = "de-DE",
        });
        Assert.Equal(HttpStatusCode.Created, profileResponse.StatusCode);
        var profile = (await profileResponse.Content.ReadFromJsonAsync<ImportProfileModel>())!;
        var csvBytes = Encoding.UTF8.GetBytes("When,Vendor,Value,Category,Subcategory\n20/07/2026,Market,\"12,3456\",Food & Dining,Groceries\n");
        var csvResponse = await FileRequest(client, household, account, csvBytes, profileId: profile.Id, fileName: "bank.csv");
        Assert.Equal(HttpStatusCode.Created, csvResponse.StatusCode);
        var csv = (await csvResponse.Content.ReadFromJsonAsync<TransactionImportResult>())!;
        var csvDetail = (await client.GetFromJsonAsync<ImportReviewDetail>($"/api/households/{household}/imports/{csv.ImportFileId}"))!;
        var csvDraft = Assert.Single(csvDetail.Drafts);
        Assert.Equal("Groceries", csvDraft.ImportedSubcategoryName); Assert.NotNull(csvDraft.SelectedCategoryId);
        Assert.Equal(HttpStatusCode.NoContent, (await TestIdentity.Post(client, $"/api/households/{household}/imports/{csv.ImportFileId}/drafts/{csvDraft.Id}/decision",
            new { decision = "Approved", acknowledgePossibleDuplicate = false })).StatusCode);
        var complete = await TestIdentity.Post(client, $"/api/households/{household}/imports/{csv.ImportFileId}/complete", new { });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        var bytes = Create(new Sheet("Bank", [Row(4, Text("When"), Text("Vendor"), Text("Value"), Text("Category"), Text("Subcategory")),
            Row(9, Text("20/07/2026"), Text(" market "), Number("12.3456"), Text("Food & Dining"), Text("Groceries"))]));
        var inspect = (await (await FileRequest(client, household, account, bytes, inspect: true)).Content.ReadFromJsonAsync<ImportProfileInspectionModel>())!;
        Assert.Equal(profile.Id, inspect.MatchedProfile!.Id); Assert.Equal("de-DE", inspect.MatchedProfile.NumberCulture);
        var response = await FileRequest(client, household, account, bytes, profileId: profile.Id);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var excel = (await response.Content.ReadFromJsonAsync<TransactionImportResult>())!;
        Assert.Equal(1, excel.DuplicateRows); Assert.Equal(1, excel.ValidRows);
        var detail = (await client.GetFromJsonAsync<ImportReviewDetail>($"/api/households/{household}/imports/{excel.ImportFileId}"))!;
        var draft = Assert.Single(detail.Drafts); Assert.Equal(12.3456m, draft.Amount); Assert.Equal(9, draft.SourceRowNumber);
        Assert.Equal(csvDraft.SelectedCategoryId, draft.SelectedCategoryId);
        var path = $"/api/households/{household}/imports/{excel.ImportFileId}/drafts/{draft.Id}/decision";
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, path, new { decision = "Approved", acknowledgePossibleDuplicate = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await TestIdentity.Post(client, path, new { decision = "Approved", acknowledgePossibleDuplicate = true })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, $"/api/households/{household}/imports/{excel.ImportFileId}/complete", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, $"/api/households/{household}/imports/{excel.ImportFileId}/complete", new { })).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var transactions = await db.Transactions.Where(t => t.HouseholdId == household).ToListAsync();
        Assert.Equal(2, transactions.Count); Assert.Equal(9, Assert.Single(transactions, t => t.ImportFileId == excel.ImportFileId).ImportRowNumber);
    }

    [Fact]
    public async Task InvalidFormulaDraftsCannotComplete_AndMalformedWorkbooksCreateNoPartialImport()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var (_, household, account) = await Setup(client);
        var bytes = Create(new Sheet("Formula", [Row(1, Text("Date"), Text("Description"), Text("Amount")),
            Row(6, Text("2026-07-20"), Text("Missing cache"), Formula(null))]));
        var response = await FileRequest(client, household, account, bytes);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var imported = (await response.Content.ReadFromJsonAsync<TransactionImportResult>())!;
        Assert.Equal(1, imported.InvalidRows);
        var detail = (await client.GetFromJsonAsync<ImportReviewDetail>($"/api/households/{household}/imports/{imported.ImportFileId}"))!;
        Assert.Contains("Worksheet 'Formula', row 6", Assert.Single(detail.Drafts).ValidationMessage);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, $"/api/households/{household}/imports/{imported.ImportFileId}/complete", new { })).StatusCode);
        foreach (var invalid in new[] { new byte[] { 1, 2, 3 }, new byte[] { 0xd0, 0xcf, 0x11, 0xe0 },
            Create(new Sheet("Oversize", StandardRows(new string('x', 4097)))) })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await FileRequest(client, household, account, invalid)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await FileRequest(client, household, account, invalid, inspect: true)).StatusCode);
        }
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(1, await db.ImportFiles.CountAsync(f => f.HouseholdId == household));
        Assert.False(await db.Transactions.AnyAsync(t => t.HouseholdId == household));
    }

    [Fact]
    public async Task WorkbookInspectionAndStaging_EnforceViewerPersonalOwnerPrivacyAndArchivedPermissions()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        var (ownerId, household, shared) = await Setup(owner);
        using var viewer = factory.CreateAuthenticatedTestClient();
        var viewerId = await TestIdentity.RegisterAndSignIn(viewer, confirmationHost: factory);
        Guid viewerAccount; Guid ownerAccount;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>(); var now = DateTimeOffset.UtcNow;
            var house = await db.Households.SingleAsync(h => h.Id == household);
            db.HouseholdMembers.Add(house.AddInvitedMember(viewerId, HouseholdRole.Viewer, ownerId, now));
            var own = Account.CreatePersonal(household, viewerId, "Viewer private", AccountType.Chequing, "CAD", null, null, now);
            var other = Account.CreatePersonal(household, ownerId, "Owner private", AccountType.Chequing, "CAD", null, null, now);
            viewerAccount = own.Id; ownerAccount = other.Id; db.Accounts.AddRange(own, other); await db.SaveChangesAsync();
        }
        foreach (var inspect in new[] { false, true })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await FileRequest(viewer, household, shared, [1], inspect: inspect)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await FileRequest(viewer, household, ownerAccount, [1], inspect: inspect)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await FileRequest(owner, household, viewerAccount, [1], inspect: inspect)).StatusCode);
        }
        var bytes = Create(new Sheet("Private", StandardRows()));
        Assert.Equal(HttpStatusCode.OK, (await FileRequest(viewer, household, viewerAccount, bytes, inspect: true)).StatusCode);
        var response = await FileRequest(viewer, household, viewerAccount, bytes);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var import = (await response.Content.ReadFromJsonAsync<TransactionImportResult>())!;
        var detail = (await viewer.GetFromJsonAsync<ImportReviewDetail>($"/api/households/{household}/imports/{import.ImportFileId}"))!;
        Assert.True(detail.CanEdit); Assert.True(Assert.Single(detail.Drafts).IncludeInPersonalBudget);
        Assert.False(detail.Drafts[0].IncludeInHouseholdBudget);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/households/{household}/imports/{import.ImportFileId}")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            (await db.Accounts.SingleAsync(a => a.Id == viewerAccount)).Archive(DateTimeOffset.UtcNow); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await FileRequest(viewer, household, viewerAccount, bytes, inspect: true)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await FileRequest(viewer, household, viewerAccount, bytes)).StatusCode);
    }

    private async Task<(Guid User, Guid Household, Guid Account)> Setup(HttpClient client)
    {
        var user = await TestIdentity.RegisterAndSignIn(client, confirmationHost: factory);
        var response = await TestIdentity.Post(client, "/api/households", new { name = "Excel " + Guid.NewGuid(), defaultCurrency = "CAD", timeZoneId = "America/Vancouver" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var household = (await response.Content.ReadFromJsonAsync<Created>())!.Id;
        response = await TestIdentity.Post(client, $"/api/households/{household}/accounts", new { name = "Chequing", type = "Chequing", scope = "Household", currency = "CAD" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (user, household, (await response.Content.ReadFromJsonAsync<Created>())!.Id);
    }
    private static async Task<HttpResponseMessage> FileRequest(HttpClient client, Guid household, Guid account, byte[] bytes, string? worksheet = null,
        bool inspect = false, bool allowDuplicate = false, Guid? profileId = null, string fileName = "synthetic.xlsx")
    {
        var csrf = (await client.GetFromJsonAsync<Csrf>("/api/auth/antiforgery"))!;
        using var body = new MultipartFormDataContent();
        body.Add(new StringContent(account.ToString()), "accountId"); body.Add(new ByteArrayContent(bytes), "file", fileName);
        if (worksheet is not null) body.Add(new StringContent(worksheet), "worksheetId");
        if (profileId is not null) body.Add(new StringContent(profileId.ToString()!), "profileId");
        body.Add(new StringContent(allowDuplicate.ToString()), "allowDuplicateFile");
        using var request = new HttpRequestMessage(HttpMethod.Post, inspect ? $"/api/households/{household}/import-profiles/inspect" : $"/api/households/{household}/imports") { Content = body };
        request.Headers.Add("X-XSRF-TOKEN", csrf.Token); return await client.SendAsync(request);
    }
    private sealed record Created(Guid Id);
    private sealed record Csrf(string Token);
}
