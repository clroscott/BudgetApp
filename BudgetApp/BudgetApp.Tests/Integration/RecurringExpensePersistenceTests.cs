using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.RecurringExpenses;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Tests.Integration;

public sealed class RecurringExpensePersistenceTests
{
    [Fact]
    public async Task RecurringExpense_WithSubcategoryAndAccount_CanBeSavedAndLoaded()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var context = CreateContext(connection);
        var dependencies = await AddDependencies(context);
        var expense = RecurringExpense.CreatePersonal(
            dependencies.Household.Id,
            dependencies.UserId,
            "Netflix",
            22.99m,
            "CAD",
            dependencies.Subcategory.Id,
            dependencies.Account.Id,
            15,
            new DateOnly(2026, 1, 1),
            null,
            DateTimeOffset.UtcNow,
            RecurringExpenseBudgetMode.Overall);

        context.RecurringExpenses.Add(expense);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var saved = await context.RecurringExpenses.SingleAsync(item => item.Id == expense.Id);

        Assert.Equal(dependencies.Household.Id, saved.HouseholdId);
        Assert.Equal(dependencies.UserId, saved.OwnerUserId);
        Assert.Equal(dependencies.Subcategory.Id, saved.CategoryId);
        Assert.Equal(dependencies.Account.Id, saved.AccountId);
        Assert.Equal(RecurringExpenseScope.Personal, saved.Scope);
        Assert.Equal(RecurringExpenseBudgetMode.Overall, saved.BudgetMode);
        Assert.Equal(22.99m, saved.Amount);
    }

    [Fact]
    public async Task CategoryAndAccountForeignKeys_AreEnforced()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var context = CreateContext(connection);
        var dependencies = await AddDependencies(context);
        context.RecurringExpenses.Add(RecurringExpense.CreateHousehold(
            dependencies.Household.Id,
            "Unknown expense",
            10m,
            "CAD",
            Guid.NewGuid(),
            Guid.NewGuid(),
            null,
            new DateOnly(2026, 1, 1),
            null,
            DateTimeOffset.UtcNow));

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
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

    private static async Task<Dependencies> AddDependencies(BudgetAppDbContext context)
    {
        var userId = Guid.NewGuid();
        context.Users.Add(new ApplicationUser
        {
            Id = userId,
            DisplayName = "Recurring Expense Owner",
            Email = $"recurring-{userId:N}@example.test",
            NormalizedEmail = $"RECURRING-{userId:N}@EXAMPLE.TEST",
            UserName = $"recurring-{userId:N}@example.test",
            NormalizedUserName = $"RECURRING-{userId:N}@EXAMPLE.TEST"
        });
        var household = Household.Create(
            "Recurring Expense Household",
            "CAD",
            "America/Vancouver",
            userId,
            DateTimeOffset.UtcNow);
        var category = Category.CreateRoot(
            household.Id,
            "Subscriptions",
            CategoryType.Expense,
            0,
            DateTimeOffset.UtcNow);
        var subcategory = category.AddSubcategory(
            "Streaming",
            0,
            DateTimeOffset.UtcNow);
        var account = Account.CreatePersonal(
            household.Id,
            userId,
            "Personal credit card",
            AccountType.CreditCard,
            "CAD",
            null,
            "1234",
            DateTimeOffset.UtcNow);
        context.Households.Add(household);
        context.Categories.Add(category);
        context.Accounts.Add(account);
        await context.SaveChangesAsync();
        return new Dependencies(userId, household, subcategory, account);
    }

    private sealed record Dependencies(
        Guid UserId,
        Household Household,
        Category Subcategory,
        Account Account);
}
