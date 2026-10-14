using System.Data.Common;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Email;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

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
            new ImportStatistics(1, 1, 0, 0, 0, 0),
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
            new ImportStatistics(1, 1, 0, 1, 0, 0),
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

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Completion_InterruptedAfterInsertRollsBackEverythingAndCanRetry(bool cancel)
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var interruption = new InterruptSecondTransactionInsert(cancel);
        var options = new DbContextOptionsBuilder<BudgetAppDbContext>()
            .UseSqlite(connection).AddInterceptors(interruption).Options;
        await using var context = new BudgetAppDbContext(options);
        await context.Database.EnsureCreatedAsync();
        var data = await AddDependencies(context);
        var file = await AddImportFile(context, data);
        var drafts = new[] { CreateDraft(file.Id, 2, "First"), CreateDraft(file.Id, 8, "Second"),
            CreateDraft(file.Id, 90, "Excluded") };
        foreach (var draft in drafts)
        {
            draft.SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, DateTimeOffset.UtcNow);
            draft.Approve(data.UserId, false, DateTimeOffset.UtcNow);
        }
        drafts[2].Exclude(data.UserId, DateTimeOffset.UtcNow);
        drafts[0].SetBudgetInclusion(true, data.UserId, DateTimeOffset.UtcNow);
        file.StartProcessing(DateTimeOffset.UtcNow);
        file.MarkReadyForReview(new ImportStatistics(3, 3, 0, 2, 1, 0), DateTimeOffset.UtcNow);
        context.ImportTransactionDrafts.AddRange(drafts);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var services = new ServiceCollection();
        services.AddLogging();
        // Registration only; the externally supplied SQLite context always wins.
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;",
            new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddSingleton(context);
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
        interruption.Enabled = true;

        var attempt = () => service.CompleteAsync(data.Household.Id, data.UserId, file.Id, CancellationToken.None);
        if (cancel) await Assert.ThrowsAnyAsync<OperationCanceledException>(attempt);
        else await Assert.ThrowsAsync<DbUpdateException>(attempt);
        Assert.Equal(2, interruption.InsertAttempts);
        interruption.Enabled = false;
        context.ChangeTracker.Clear();

        Assert.Empty(await context.Transactions.ToListAsync());
        Assert.Empty(await context.AuditEvents.ToListAsync());
        Assert.Equal(ImportFileStatus.ReadyForReview, (await context.ImportFiles.SingleAsync()).Status);
        Assert.All(await context.ImportTransactionDrafts.ToListAsync(), draft => Assert.Null(draft.ApprovedTransactionId));

        var completed = await attempt();
        var retry = await attempt();
        Assert.Equal(2, completed.CreatedTransactionCount);
        Assert.Equal(0, retry.CreatedTransactionCount);
        context.ChangeTracker.Clear();
        var transactions = await context.Transactions.Include(transaction => transaction.PersonalBudgetInclusions).ToListAsync();
        Assert.Equal(2, transactions.Count);
        Assert.Single(await context.AuditEvents.ToListAsync());
        Assert.Equal(ImportFileStatus.Completed, (await context.ImportFiles.SingleAsync()).Status);
        var savedDrafts = await context.ImportTransactionDrafts.ToListAsync();
        foreach (var transaction in transactions)
        {
            var linked = Assert.Single(savedDrafts, draft => draft.SourceRowNumber == transaction.ImportRowNumber);
            Assert.Equal(transaction.Id, linked.ApprovedTransactionId);
            Assert.Equal(linked.Amount, transaction.Amount);
        }
        Assert.Null(Assert.Single(savedDrafts, draft => draft.SourceRowNumber == 90).ApprovedTransactionId);
        Assert.Contains(Assert.Single(transactions, transaction => transaction.ImportRowNumber == 2).PersonalBudgetInclusions,
            inclusion => inclusion.UserId == data.UserId);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TargetedSaveFailureRollsBackRowCountsAndAuditAndCanRetry(bool cancel)
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var fault = new InterruptDraftUpdate(cancel);
        var options = new DbContextOptionsBuilder<BudgetAppDbContext>().UseSqlite(connection).AddInterceptors(fault).Options;
        await using var context = new BudgetAppDbContext(options);
        await context.Database.EnsureCreatedAsync();
        var data = await AddDependencies(context);
        var file = await AddImportFile(context, data);
        var rows = new[] { CreateDraft(file.Id, 2, "First"), CreateDraft(file.Id, 3, "Second") };
        file.StartProcessing(DateTimeOffset.UtcNow);
        file.MarkReadyForReview(new ImportStatistics(2, 2, 0, 0, 0, 0), DateTimeOffset.UtcNow);
        context.ImportTransactionDrafts.AddRange(rows);
        await context.SaveChangesAsync();
        var originalVersion = file.UpdatedAtUtc;
        context.ChangeTracker.Clear();
        using var provider = TargetedProvider(context);
        using var scope = provider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
        fault.Enabled = true;
        var save = () => service.UpdateDraftAsync(data.Household.Id, data.UserId, file.Id, rows[0].Id,
            rows[0].TransactionDate, 0m, "Unsaved correction", null, CancellationToken.None,
            expectedImportUpdatedAtUtc: originalVersion);
        if (cancel) await Assert.ThrowsAnyAsync<OperationCanceledException>(save);
        else await Assert.ThrowsAsync<DbUpdateException>(save);
        fault.Enabled = false;
        context.ChangeTracker.Clear();
        Assert.Empty(await context.AuditEvents.ToListAsync());
        Assert.Empty(await context.Transactions.ToListAsync());
        var storedFile = await context.ImportFiles.AsNoTracking().SingleAsync(item => item.Id == file.Id);
        Assert.Equal(2, storedFile.ValidRowCount);
        Assert.Equal(0, storedFile.InvalidRowCount);
        Assert.Equal(originalVersion, storedFile.UpdatedAtUtc);
        Assert.Equal("First", (await context.ImportTransactionDrafts.AsNoTracking().SingleAsync(item => item.Id == rows[0].Id)).Description);
        var result = await save();
        Assert.Equal(1, result.Summary.Counts.InvalidRows);
        Assert.Single(context.ChangeTracker.Entries<ImportTransactionDraft>());
        context.ChangeTracker.Clear();
        Assert.Single(await context.AuditEvents.ToListAsync());
        Assert.Empty(await context.Transactions.ToListAsync());
    }

    [Fact]
    public async Task ConcurrentDifferentRowChangeCannotLoseGlobalCountsOrPartiallySave()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var race = new BeforeTargetedSave();
        var options = new DbContextOptionsBuilder<BudgetAppDbContext>().UseSqlite(connection).AddInterceptors(race).Options;
        await using var context = new BudgetAppDbContext(options);
        await context.Database.EnsureCreatedAsync();
        var data = await AddDependencies(context);
        var file = await AddImportFile(context, data);
        var rows = new[] { CreateDraft(file.Id, 2, "First"), CreateDraft(file.Id, 3, "Second"), CreateDraft(file.Id, 4, "Third") };
        rows[0].SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, DateTimeOffset.UtcNow);
        rows[0].Approve(data.UserId, false, DateTimeOffset.UtcNow);
        file.StartProcessing(DateTimeOffset.UtcNow);
        file.MarkReadyForReview(new ImportStatistics(3, 3, 0, 1, 0, 0), DateTimeOffset.UtcNow);
        context.ImportTransactionDrafts.AddRange(rows);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var winnerVersion = DateTimeOffset.UtcNow.AddMinutes(1);
        race.Callback = async () =>
        {
            await using var winner = CreateContext(connection);
            var winnerFile = await winner.ImportFiles.SingleAsync(item => item.Id == file.Id);
            var otherRow = await winner.ImportTransactionDrafts.SingleAsync(item => item.Id == rows[1].Id);
            otherRow.Exclude(data.UserId, winnerVersion);
            winnerFile.RefreshStatistics(new ImportStatistics(3, 3, 0, 1, 1, 0), winnerVersion);
            await winner.SaveChangesAsync();
        };
        using var provider = TargetedProvider(context);
        using var scope = provider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ImportReviewService>();
        var save = () => service.UpdateDraftAsync(data.Household.Id, data.UserId, file.Id, rows[0].Id,
            rows[0].TransactionDate, -11.2345m, "First correction", null, CancellationToken.None);
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(save);
        context.ChangeTracker.Clear();
        var storedFile = await context.ImportFiles.AsNoTracking().SingleAsync(item => item.Id == file.Id);
        Assert.Equal(1, storedFile.ApprovedRowCount);
        Assert.Equal(1, storedFile.ExcludedRowCount);
        var storedRows = await context.ImportTransactionDrafts.AsNoTracking().Where(item => item.ImportFileId == file.Id).ToListAsync();
        Assert.Equal("First", storedRows.Single(item => item.Id == rows[0].Id).Description);
        Assert.Equal(ImportDraftReviewDecision.Excluded, storedRows.Single(item => item.Id == rows[1].Id).ReviewDecision);
        Assert.Empty(await context.AuditEvents.ToListAsync());
        Assert.Empty(await context.Transactions.ToListAsync());
        var result = await save();
        Assert.Equal(0, result.Summary.Counts.ApprovedRows);
        Assert.Equal(1, result.Summary.Counts.ExcludedRows);
        Assert.Equal(2, result.Summary.Counts.PendingRows);
        Assert.True(result.Summary.UpdatedAtUtc > winnerVersion);
        Assert.Single(context.ChangeTracker.Entries<ImportTransactionDraft>());
        context.ChangeTracker.Clear();
        Assert.Single(await context.AuditEvents.ToListAsync());
    }

    private static ServiceProvider TargetedProvider(BudgetAppDbContext context)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;", new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddSingleton(context);
        return services.BuildServiceProvider();
    }
    private sealed class BeforeTargetedSave : SaveChangesInterceptor
    {
        internal Func<Task>? Callback { get; set; }
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var action = Callback;
            Callback = null;
            if (action is not null) await action();
            return result;
        }
    }
    private sealed class InterruptDraftUpdate(bool cancel) : DbCommandInterceptor
    {
        internal bool Enabled { get; set; }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (Enabled && command.CommandText.Contains("UPDATE \"ImportTransactionDrafts\"", StringComparison.Ordinal))
            {
                if (cancel) throw new OperationCanceledException(new CancellationToken(true));
                throw new InvalidOperationException("Synthetic targeted-row save failure.");
            }
            return ValueTask.FromResult(result);
        }
    }

    private sealed class InterruptSecondTransactionInsert(bool cancel) : DbCommandInterceptor
    {
        internal bool Enabled { get; set; }
        internal int InsertAttempts { get; private set; }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (Enabled && command.CommandText.Contains("INSERT INTO \"Transactions\"", StringComparison.Ordinal) &&
                ++InsertAttempts == 2)
            {
                if (cancel) throw new OperationCanceledException(new CancellationToken(true));
                throw new InvalidOperationException("Synthetic second-insert failure.");
            }
            return ValueTask.FromResult(result);
        }
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
