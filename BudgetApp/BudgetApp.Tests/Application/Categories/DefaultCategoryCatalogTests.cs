using BudgetApp.Application.Categories;
using BudgetApp.Domain.Categories;

namespace BudgetApp.Tests.Application.Categories;

public sealed class DefaultCategoryCatalogTests
{
    [Fact]
    public void CreateForHousehold_CreatesExpectedHierarchy()
    {
        var householdId = Guid.NewGuid();
        var createdAtUtc = new DateTimeOffset(
            2026,
            7,
            22,
            12,
            0,
            0,
            TimeSpan.Zero);

        var roots = DefaultCategoryCatalog.CreateForHousehold(
            householdId,
            createdAtUtc);

        Assert.Equal(10, roots.Count);
        Assert.Equal(29, roots.Sum(root => root.Children.Count));
        Assert.Equal(
            [
                "Income",
                "Transfers",
                "Housing",
                "Food & Dining",
                "Transportation",
                "Entertainment",
                "Subscriptions",
                "Shopping",
                "Health",
                "Other"
            ],
            roots.Select(root => root.Name));

        Assert.All(roots, root =>
        {
            Assert.Equal(householdId, root.HouseholdId);
            Assert.Null(root.ParentCategoryId);
            Assert.True(root.IsActive);

            Assert.All(root.Children, child =>
            {
                Assert.Equal(householdId, child.HouseholdId);
                Assert.Equal(root.Id, child.ParentCategoryId);
                Assert.Equal(root.Type, child.Type);
                Assert.True(child.IsActive);
            });
        });

        Assert.Equal(
            CategoryType.Income,
            roots.Single(root => root.Name == "Income").Type);
        Assert.Equal(
            CategoryType.Transfer,
            roots.Single(root => root.Name == "Transfers").Type);
        Assert.All(
            roots.Where(root =>
                root.Name is not "Income" and not "Transfers"),
            root => Assert.Equal(CategoryType.Expense, root.Type));
    }

    [Fact]
    public void CreateForHousehold_CreatesIndependentCopies()
    {
        var first = DefaultCategoryCatalog.CreateForHousehold(
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);
        var second = DefaultCategoryCatalog.CreateForHousehold(
            Guid.NewGuid(),
            DateTimeOffset.UtcNow);

        Assert.Empty(
            first.SelectMany(Flatten)
                .Select(category => category.Id)
                .Intersect(second.SelectMany(Flatten)
                    .Select(category => category.Id)));
    }

    private static IEnumerable<Category> Flatten(Category root) =>
        root.Children.Prepend(root);
}
