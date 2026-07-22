using BudgetApp.Domain.Categories;

namespace BudgetApp.Application.Categories;

public static class DefaultCategoryCatalog
{
    private static readonly DefaultCategoryDefinition[] Definitions =
    [
        new(
            "Income",
            CategoryType.Income,
            ["Paycheque", "Interest", "Other Income"]),
        new(
            "Transfers",
            CategoryType.Transfer,
            ["Account Transfer", "Credit Card Payment"]),
        new(
            "Housing",
            CategoryType.Expense,
            ["Rent or Mortgage", "Utilities", "Insurance", "Maintenance"]),
        new(
            "Food & Dining",
            CategoryType.Expense,
            ["Groceries", "Restaurants"]),
        new(
            "Transportation",
            CategoryType.Expense,
            ["Fuel", "Public Transit", "Parking", "Repairs"]),
        new(
            "Entertainment",
            CategoryType.Expense,
            ["Events", "Games", "Movies"]),
        new(
            "Subscriptions",
            CategoryType.Expense,
            ["Streaming", "Software", "Memberships"]),
        new(
            "Shopping",
            CategoryType.Expense,
            ["Clothing", "Household Items", "Personal"]),
        new(
            "Health",
            CategoryType.Expense,
            ["Medical", "Dental", "Pharmacy", "Fitness"]),
        new(
            "Other",
            CategoryType.Expense,
            ["Miscellaneous"])
    ];

    public static IReadOnlyList<Category> CreateForHousehold(
        Guid householdId,
        DateTimeOffset createdAtUtc)
    {
        if (householdId == Guid.Empty)
        {
            throw new ArgumentException(
                "Household ID is required.",
                nameof(householdId));
        }

        var roots = new List<Category>(Definitions.Length);

        for (var rootIndex = 0; rootIndex < Definitions.Length; rootIndex++)
        {
            var definition = Definitions[rootIndex];
            var root = Category.CreateRoot(
                householdId,
                definition.Name,
                definition.Type,
                rootIndex,
                createdAtUtc);

            for (var childIndex = 0;
                 childIndex < definition.SubcategoryNames.Count;
                 childIndex++)
            {
                root.AddSubcategory(
                    definition.SubcategoryNames[childIndex],
                    childIndex,
                    createdAtUtc);
            }

            roots.Add(root);
        }

        return roots;
    }

    private sealed record DefaultCategoryDefinition(
        string Name,
        CategoryType Type,
        IReadOnlyList<string> SubcategoryNames);
}
