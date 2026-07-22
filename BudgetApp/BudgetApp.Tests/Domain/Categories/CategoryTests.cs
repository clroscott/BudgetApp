using BudgetApp.Domain.Categories;

namespace BudgetApp.Tests.Domain.Categories;

public sealed class CategoryTests
{
    private static readonly DateTimeOffset CreatedAtUtc =
        new(2026, 7, 22, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void CreateRoot_CreatesActiveHouseholdCategory()
    {
        var householdId = Guid.NewGuid();

        var category = Category.CreateRoot(
            householdId,
            "  Food & Dining  ",
            CategoryType.Expense,
            3,
            CreatedAtUtc);

        Assert.NotEqual(Guid.Empty, category.Id);
        Assert.Equal(householdId, category.HouseholdId);
        Assert.Equal("Food & Dining", category.Name);
        Assert.Equal("FOOD & DINING", category.NormalizedName);
        Assert.Equal(CategoryType.Expense, category.Type);
        Assert.Null(category.ParentCategoryId);
        Assert.True(category.IsActive);
        Assert.Equal(3, category.DisplayOrder);
        Assert.Equal(CreatedAtUtc, category.CreatedAtUtc);
        Assert.Equal(CreatedAtUtc, category.UpdatedAtUtc);
        Assert.Empty(category.Children);
    }

    [Fact]
    public void AddSubcategory_InheritsHouseholdAndType()
    {
        var root = CreateRoot();

        var subcategory = root.AddSubcategory("Groceries", 1, CreatedAtUtc);

        Assert.Equal(root.HouseholdId, subcategory.HouseholdId);
        Assert.Equal(root.Type, subcategory.Type);
        Assert.Equal(root.Id, subcategory.ParentCategoryId);
        Assert.Same(root, subcategory.Parent);
        Assert.Same(subcategory, Assert.Single(root.Children));
    }

    [Fact]
    public void AddSubcategory_RejectsThirdHierarchyLevel()
    {
        var subcategory = CreateRoot()
            .AddSubcategory("Groceries", 1, CreatedAtUtc);

        var exception = Assert.Throws<InvalidOperationException>(() =>
            subcategory.AddSubcategory("Produce", 1, CreatedAtUtc));

        Assert.Equal(
            "Subcategories cannot contain another category.",
            exception.Message);
    }

    [Fact]
    public void AddSubcategory_RejectsDuplicateSiblingNameIgnoringCase()
    {
        var root = CreateRoot();
        root.AddSubcategory("Groceries", 1, CreatedAtUtc);

        Assert.Throws<InvalidOperationException>(() =>
            root.AddSubcategory(" groceries ", 2, CreatedAtUtc));
    }

    [Fact]
    public void Deactivate_RejectsCategoryWithActiveSubcategories()
    {
        var root = CreateRoot();
        root.AddSubcategory("Groceries", 1, CreatedAtUtc);

        Assert.Throws<InvalidOperationException>(() =>
            root.Deactivate(CreatedAtUtc.AddMinutes(1)));
    }

    [Fact]
    public void Deactivate_AllowsParentAfterChildrenAreDeactivated()
    {
        var root = CreateRoot();
        var subcategory = root.AddSubcategory("Groceries", 1, CreatedAtUtc);
        var updatedAtUtc = CreatedAtUtc.AddMinutes(1);

        subcategory.Deactivate(updatedAtUtc);
        root.Deactivate(updatedAtUtc);

        Assert.False(subcategory.IsActive);
        Assert.False(root.IsActive);
        Assert.Equal(updatedAtUtc, root.UpdatedAtUtc);
    }

    [Fact]
    public void Reactivate_RejectsSubcategoryWithInactiveParent()
    {
        var root = CreateRoot();
        var subcategory = root.AddSubcategory("Groceries", 1, CreatedAtUtc);
        subcategory.Deactivate(CreatedAtUtc.AddMinutes(1));
        root.Deactivate(CreatedAtUtc.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() =>
            subcategory.Reactivate(CreatedAtUtc.AddMinutes(2)));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void CreateRoot_RejectsMissingName(string name)
    {
        var exception = Assert.Throws<ArgumentException>(() =>
            Category.CreateRoot(
                Guid.NewGuid(),
                name,
                CategoryType.Expense,
                0,
                CreatedAtUtc));

        Assert.Equal("name", exception.ParamName);
    }

    [Fact]
    public void CreateRoot_RejectsNegativeDisplayOrder()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Category.CreateRoot(
                Guid.NewGuid(),
                "Housing",
                CategoryType.Expense,
                -1,
                CreatedAtUtc));
    }

    [Fact]
    public void CreateRoot_RejectsUnsupportedCategoryType()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Category.CreateRoot(
                Guid.NewGuid(),
                "Housing",
                (CategoryType)999,
                0,
                CreatedAtUtc));
    }

    private static Category CreateRoot() =>
        Category.CreateRoot(
            Guid.NewGuid(),
            "Food & Dining",
            CategoryType.Expense,
            0,
            CreatedAtUtc);
}
