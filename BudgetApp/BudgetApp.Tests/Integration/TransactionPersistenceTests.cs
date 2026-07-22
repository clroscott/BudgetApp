using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Tests.Integration;

public sealed class TransactionPersistenceTests
{
    [Fact]
    public async Task Transaction_CanBeSavedAndLoaded()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var data = await AddTransactionDependencies(context);
        var transaction = Transaction.CreateManual(
            data.Household.Id,
            data.Account.Id,
            data.Category.Id,
            new DateOnly(2026, 7, 20),
            new DateOnly(2026, 7, 21),
            -47.25m,
            "Groceries",
            "Example Market",
            "Weekly shop",
            isExcludedFromBudget: false,
            data.UserId,
            DateTimeOffset.UtcNow);

        context.Transactions.Add(transaction);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var saved = await context.Transactions.SingleAsync(
            candidate => candidate.Id == transaction.Id);

        Assert.Equal(data.Household.Id, saved.HouseholdId);
        Assert.Equal(data.Account.Id, saved.AccountId);
        Assert.Equal(data.Category.Id, saved.CategoryId);
        Assert.Equal(new DateOnly(2026, 7, 20), saved.TransactionDate);
        Assert.Equal(-47.25m, saved.Amount);
        Assert.Equal(TransactionSource.Manual, saved.Source);
        Assert.Equal(TransactionReviewStatus.Reviewed, saved.ReviewStatus);
    }

    [Fact]
    public async Task Transaction_WithUnknownAccount_IsRejectedByDatabase()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var data = await AddTransactionDependencies(context);
        context.Transactions.Add(Transaction.CreateManual(
            data.Household.Id,
            Guid.NewGuid(),
            categoryId: null,
            DateOnly.FromDateTime(DateTime.UtcNow),
            postedDate: null,
            -10m,
            "Unknown account",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            data.UserId,
            DateTimeOffset.UtcNow));

        await Assert.ThrowsAsync<DbUpdateException>(() =>
            context.SaveChangesAsync());
    }

    [Fact]
    public async Task DuplicateImportedRow_IsRejectedByDatabase()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var data = await AddTransactionDependencies(context);
        var importFileId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        context.Transactions.Add(Transaction.CreateImported(
            data.Household.Id,
            data.Account.Id,
            categoryId: null,
            importFileId,
            importRowNumber: 3,
            DateOnly.FromDateTime(DateTime.UtcNow),
            postedDate: null,
            -10m,
            "First",
            "RAW FIRST",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            data.UserId,
            now));
        context.Transactions.Add(Transaction.CreateImported(
            data.Household.Id,
            data.Account.Id,
            categoryId: null,
            importFileId,
            importRowNumber: 3,
            DateOnly.FromDateTime(DateTime.UtcNow),
            postedDate: null,
            -20m,
            "Second",
            "RAW SECOND",
            merchantName: null,
            notes: null,
            isExcludedFromBudget: false,
            data.UserId,
            now));

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

    private static async Task<TransactionDependencies> AddTransactionDependencies(
        BudgetAppDbContext context)
    {
        var userId = Guid.NewGuid();
        context.Users.Add(new ApplicationUser
        {
            Id = userId,
            DisplayName = "Transaction Owner",
            Email = $"transaction-{userId:N}@example.test",
            NormalizedEmail = $"TRANSACTION-{userId:N}@EXAMPLE.TEST",
            UserName = $"transaction-{userId:N}@example.test",
            NormalizedUserName = $"TRANSACTION-{userId:N}@EXAMPLE.TEST"
        });

        var household = Household.Create(
            "Transaction Household",
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

        return new TransactionDependencies(userId, household, account, category);
    }

    private sealed record TransactionDependencies(
        Guid UserId,
        Household Household,
        Account Account,
        Category Category);
}
