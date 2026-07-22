using BudgetApp.Domain.Categories;

namespace BudgetApp.Application.Categories;

public sealed record CategoryTreeItem(
    Guid Id,
    string Name,
    string Type,
    int DisplayOrder,
    bool IsActive,
    IReadOnlyList<CategoryTreeItem> Children);

public sealed record CategoryRecord(
    Guid Id,
    string Name,
    string NormalizedName,
    CategoryType Type,
    Guid? ParentCategoryId,
    int DisplayOrder,
    bool IsActive);
