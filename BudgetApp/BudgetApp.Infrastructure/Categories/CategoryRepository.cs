using BudgetApp.Application.Categories;
using BudgetApp.Domain.Categories;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Categories;

internal sealed class CategoryRepository(BudgetAppDbContext dbContext)
    : ICategoryRepository
{
    public async Task<IReadOnlyList<CategoryRecord>> ListAsync(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Categories
            .AsNoTracking()
            .Where(category => category.HouseholdId == householdId)
            .Select(category => new CategoryRecord(
                category.Id,
                category.Name,
                category.NormalizedName,
                category.Type,
                category.ParentCategoryId,
                category.DisplayOrder,
                category.IsActive))
            .ToListAsync(cancellationToken);
    }

    public Task<Category?> GetForUpdateAsync(
        Guid householdId,
        Guid categoryId,
        CancellationToken cancellationToken)
    {
        return dbContext.Categories
            .Include(category => category.Children)
            .Include(category => category.Parent)
            .SingleOrDefaultAsync(
                category =>
                    category.HouseholdId == householdId &&
                    category.Id == categoryId,
                cancellationToken);
    }

    public async Task<IReadOnlyList<Category>> GetForUpdateAsync(
        Guid householdId,
        IReadOnlyCollection<Guid> categoryIds,
        CancellationToken cancellationToken)
    {
        return await dbContext.Categories
            .Where(category =>
                category.HouseholdId == householdId &&
                categoryIds.Contains(category.Id))
            .ToListAsync(cancellationToken);
    }

    public Task<bool> NameExistsAsync(
        Guid householdId,
        string normalizedName,
        CategoryType type,
        Guid? parentCategoryId,
        Guid? excludedCategoryId,
        CancellationToken cancellationToken)
    {
        return dbContext.Categories.AnyAsync(
            category =>
                category.HouseholdId == householdId &&
                category.Type == type &&
                category.ParentCategoryId == parentCategoryId &&
                category.NormalizedName == normalizedName &&
                category.Id != excludedCategoryId,
            cancellationToken);
    }

    public async Task<int> GetNextDisplayOrderAsync(
        Guid householdId,
        CategoryType type,
        Guid? parentCategoryId,
        CancellationToken cancellationToken)
    {
        var currentMaximum = await dbContext.Categories
            .Where(category =>
                category.HouseholdId == householdId &&
                category.Type == type &&
                category.ParentCategoryId == parentCategoryId)
            .Select(category => (int?)category.DisplayOrder)
            .MaxAsync(cancellationToken);

        return (currentMaximum ?? -1) + 1;
    }

    public async Task AddAsync(
        Category category,
        CancellationToken cancellationToken)
    {
        await dbContext.Categories.AddAsync(category, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
