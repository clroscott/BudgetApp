using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Tests.Integration;

public sealed class BudgetPersistenceTests
{
    [Fact]
    public async Task BudgetMonth_WithLines_CanBeSavedAndLoaded()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var context = CreateContext(connection);
        var dependencies = await AddDependencies(context);
        var budget = BudgetMonth.CreateHousehold(
            dependencies.Household.Id,
            2026,
            7,
            "CAD",
            DateTimeOffset.UtcNow);
        budget.AddLine(dependencies.Category.Id, 600m, DateTimeOffset.UtcNow);

        context.BudgetMonths.Add(budget);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var saved = await context.BudgetMonths
            .Include(candidate => candidate.Lines)
            .SingleAsync(candidate => candidate.Id == budget.Id);

        Assert.Equal(BudgetScope.Household, saved.Scope);
        Assert.Equal("CAD", saved.Currency);
        var line = Assert.Single(saved.Lines);
        Assert.Equal(dependencies.Category.Id, line.CategoryId);
        Assert.Equal(600m, line.BudgetedAmount);
    }

    [Fact]
    public async Task DuplicateHouseholdBudgetMonth_IsRejectedByDatabase()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var context = CreateContext(connection);
        var dependencies = await AddDependencies(context);
        context.BudgetMonths.Add(BudgetMonth.CreateHousehold(
            dependencies.Household.Id, 2026, 7, "CAD", DateTimeOffset.UtcNow));
        context.BudgetMonths.Add(BudgetMonth.CreateHousehold(
            dependencies.Household.Id, 2026, 7, "CAD", DateTimeOffset.UtcNow));

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
            DisplayName = "Budget Owner",
            Email = $"budget-{userId:N}@example.test",
            NormalizedEmail = $"BUDGET-{userId:N}@EXAMPLE.TEST",
            UserName = $"budget-{userId:N}@example.test",
            NormalizedUserName = $"BUDGET-{userId:N}@EXAMPLE.TEST"
        });
        var household = Household.Create(
            "Budget Household",
            "CAD",
            "America/Vancouver",
            userId,
            DateTimeOffset.UtcNow);
        var category = Category.CreateRoot(
            household.Id,
            "Food & Dining",
            CategoryType.Expense,
            0,
            DateTimeOffset.UtcNow);
        context.Households.Add(household);
        context.Categories.Add(category);
        await context.SaveChangesAsync();
        return new Dependencies(household, category);
    }

    private sealed record Dependencies(Household Household, Category Category);
}
