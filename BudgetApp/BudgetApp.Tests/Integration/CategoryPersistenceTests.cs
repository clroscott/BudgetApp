using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Tests.Integration;

public sealed class CategoryPersistenceTests
{
    [Fact]
    public async Task CategoryHierarchy_CanBeSavedAndLoaded()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var household = await AddHousehold(context);
        var createdAtUtc = DateTimeOffset.UtcNow;
        var root = Category.CreateRoot(
            household.Id,
            "Food & Dining",
            CategoryType.Expense,
            1,
            createdAtUtc);
        root.AddSubcategory("Groceries", 1, createdAtUtc);
        root.AddSubcategory("Restaurants", 2, createdAtUtc);

        context.Categories.Add(root);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var savedRoot = await context.Categories
            .Include(category => category.Children)
            .SingleAsync(category => category.Id == root.Id);

        Assert.Equal("Food & Dining", savedRoot.Name);
        Assert.Equal(2, savedRoot.Children.Count);
        Assert.All(savedRoot.Children, child =>
        {
            Assert.Equal(savedRoot.Id, child.ParentCategoryId);
            Assert.Equal(savedRoot.HouseholdId, child.HouseholdId);
            Assert.Equal(savedRoot.Type, child.Type);
        });
    }

    [Fact]
    public async Task DuplicateRootNameWithinTypeAndHousehold_IsRejected()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var household = await AddHousehold(context);
        var createdAtUtc = DateTimeOffset.UtcNow;

        context.Categories.Add(Category.CreateRoot(
            household.Id,
            "Housing",
            CategoryType.Expense,
            1,
            createdAtUtc));
        context.Categories.Add(Category.CreateRoot(
            household.Id,
            " housing ",
            CategoryType.Expense,
            2,
            createdAtUtc));

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

    private static async Task<Household> AddHousehold(BudgetAppDbContext context)
    {
        var ownerUserId = Guid.NewGuid();
        context.Users.Add(new ApplicationUser
        {
            Id = ownerUserId,
            DisplayName = "Category Owner",
            Email = $"category-{ownerUserId:N}@example.test",
            NormalizedEmail = $"CATEGORY-{ownerUserId:N}@EXAMPLE.TEST",
            UserName = $"category-{ownerUserId:N}@example.test",
            NormalizedUserName = $"CATEGORY-{ownerUserId:N}@EXAMPLE.TEST"
        });

        var household = Household.Create(
            "Category Household",
            "CAD",
            "America/Vancouver",
            ownerUserId,
            DateTimeOffset.UtcNow);
        context.Households.Add(household);
        await context.SaveChangesAsync();
        return household;
    }
}
