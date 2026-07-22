using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Tests.Integration;

public sealed class ImportStagingPersistenceTests
{
    private const string ValidHash =
        "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";

    [Fact]
    public async Task CompletedImportWithLinkedDraft_CanBeSavedAndLoaded()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var data = await AddDependencies(context);
        var now = DateTimeOffset.UtcNow;
        var importFile = ImportFile.Create(
            data.Household.Id,
            data.Account.Id,
            data.UserId,
            "july.csv",
            2048,
            ValidHash,
            now);
        importFile.StartProcessing(now.AddMinutes(1));
        importFile.MarkReadyForReview(
            new ImportStatistics(1, 1, 0, 0, 0, 0, 0),
            now.AddMinutes(2));

        var draft = ImportTransactionDraft.Create(
            importFile.Id,
            sourceRowNumber: 2,
            rawData: "{\"date\":\"2026-07-20\",\"amount\":\"-47.25\"}",
            new DateOnly(2026, 7, 20),
            -47.25m,
            "Example Market",
            validationMessage: null,
            now);
        draft.CorrectParsedValues(
            draft.TransactionDate,
            draft.Amount,
            draft.Description,
            data.Category.Id,
            now.AddMinutes(2));
        draft.SetDuplicateResult(
            ImportDraftDuplicateStatus.NoMatch,
            possibleMatchingTransactionId: null,
            now.AddMinutes(2));
        draft.Approve(data.UserId, false, now.AddMinutes(3));

        var transaction = Transaction.CreateImported(
            data.Household.Id,
            data.Account.Id,
            data.Category.Id,
            importFile.Id,
            draft.SourceRowNumber,
            draft.TransactionDate!.Value,
            postedDate: null,
            draft.Amount!.Value,
            draft.Description!,
            draft.OriginalDescription,
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            data.UserId,
            now.AddMinutes(3));
        draft.LinkApprovedTransaction(transaction, now.AddMinutes(3));
        importFile.Complete(
            new ImportStatistics(1, 1, 0, 1, 0, 0, 0),
            now.AddMinutes(3));

        context.ImportFiles.Add(importFile);
        context.Transactions.Add(transaction);
        context.ImportTransactionDrafts.Add(draft);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var savedImport = await context.ImportFiles.SingleAsync(
            candidate => candidate.Id == importFile.Id);
        var savedDraft = await context.ImportTransactionDrafts.SingleAsync(
            candidate => candidate.Id == draft.Id);

        Assert.Equal(ImportFileStatus.Completed, savedImport.Status);
        Assert.Equal(1, savedImport.ApprovedRowCount);
        Assert.Equal(ImportDraftReviewDecision.Approved, savedDraft.ReviewDecision);
        Assert.Equal(data.Category.Id, savedDraft.SelectedCategoryId);
        Assert.Equal(transaction.Id, savedDraft.ApprovedTransactionId);
        Assert.Equal("Example Market", savedDraft.OriginalDescription);
    }

    [Fact]
    public async Task DuplicateSourceRowWithinImport_IsRejectedByDatabase()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var data = await AddDependencies(context);
        var importFile = await AddImportFile(context, data);

        context.ImportTransactionDrafts.Add(CreateDraft(importFile.Id, 2, "First"));
        context.ImportTransactionDrafts.Add(CreateDraft(importFile.Id, 2, "Second"));

        await Assert.ThrowsAsync<DbUpdateException>(() =>
            context.SaveChangesAsync());
    }

    [Fact]
    public async Task DraftWithUnknownImportFile_IsRejectedByDatabase()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        await AddDependencies(context);
        context.ImportTransactionDrafts.Add(CreateDraft(
            Guid.NewGuid(),
            sourceRowNumber: 2,
            "Unknown import"));

        await Assert.ThrowsAsync<DbUpdateException>(() =>
            context.SaveChangesAsync());
    }

    private static BudgetAppDbContext CreateContext(SqliteConnection connection)
    {
        var options = new DbContextOptionsBuilder<BudgetAppDbContext>()
            .UseSqlite(connection)
            .Options;

        var context = new BudgetAppDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    private static async Task<ImportFile> AddImportFile(
        BudgetAppDbContext context,
        ImportDependencies data)
    {
        var importFile = ImportFile.Create(
            data.Household.Id,
            data.Account.Id,
            data.UserId,
            $"{Guid.NewGuid():N}.csv",
            1024,
            ValidHash,
            DateTimeOffset.UtcNow);
        context.ImportFiles.Add(importFile);
        await context.SaveChangesAsync();
        return importFile;
    }

    private static ImportTransactionDraft CreateDraft(
        Guid importFileId,
        int sourceRowNumber,
        string description) =>
        ImportTransactionDraft.Create(
            importFileId,
            sourceRowNumber,
            $"{{\"description\":\"{description}\"}}",
            new DateOnly(2026, 7, 20),
            -10m,
            description,
            validationMessage: null,
            DateTimeOffset.UtcNow);

    private static async Task<ImportDependencies> AddDependencies(
        BudgetAppDbContext context)
    {
        var userId = Guid.NewGuid();
        context.Users.Add(new ApplicationUser
        {
            Id = userId,
            DisplayName = "Import Owner",
            Email = $"import-{userId:N}@example.test",
            NormalizedEmail = $"IMPORT-{userId:N}@EXAMPLE.TEST",
            UserName = $"import-{userId:N}@example.test",
            NormalizedUserName = $"IMPORT-{userId:N}@EXAMPLE.TEST"
        });

        var household = Household.Create(
            "Import Household",
            "CAD",
            "America/Vancouver",
            userId,
            DateTimeOffset.UtcNow);
        var account = Account.CreateHousehold(
            household.Id,
            "Chequing",
            AccountType.Chequing,
            "CAD",
            institutionName: null,
            lastFourDigits: null,
            DateTimeOffset.UtcNow);
        var category = Category.CreateRoot(
            household.Id,
            "Groceries",
            CategoryType.Expense,
            displayOrder: 1,
            DateTimeOffset.UtcNow);

        context.Households.Add(household);
        context.Accounts.Add(account);
        context.Categories.Add(category);
        await context.SaveChangesAsync();

        return new ImportDependencies(userId, household, account, category);
    }

    private sealed record ImportDependencies(
        Guid UserId,
        Household Household,
        Account Account,
        Category Category);
}
