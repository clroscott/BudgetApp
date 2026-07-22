using BudgetApp.Domain.Categories;

namespace BudgetApp.Application.Categories;

public interface ICategoryRepository
{
    Task<IReadOnlyList<CategoryRecord>> ListAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<Category?> GetForUpdateAsync(
        Guid householdId,
        Guid categoryId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<Category>> GetForUpdateAsync(
        Guid householdId,
        IReadOnlyCollection<Guid> categoryIds,
        CancellationToken cancellationToken);

    Task<bool> NameExistsAsync(
        Guid householdId,
        string normalizedName,
        CategoryType type,
        Guid? parentCategoryId,
        Guid? excludedCategoryId,
        CancellationToken cancellationToken);

    Task<int> GetNextDisplayOrderAsync(
        Guid householdId,
        CategoryType type,
        Guid? parentCategoryId,
        CancellationToken cancellationToken);

    Task AddAsync(Category category, CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
