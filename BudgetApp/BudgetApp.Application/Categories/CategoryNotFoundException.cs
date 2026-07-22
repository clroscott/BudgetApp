namespace BudgetApp.Application.Categories;

public sealed class CategoryNotFoundException()
    : InvalidOperationException("The category could not be found.");
