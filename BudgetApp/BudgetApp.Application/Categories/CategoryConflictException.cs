namespace BudgetApp.Application.Categories;

public sealed class CategoryConflictException(string message)
    : InvalidOperationException(message);
