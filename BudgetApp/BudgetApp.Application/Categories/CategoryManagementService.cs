using BudgetApp.Application.Households;
using BudgetApp.Domain.Categories;

namespace BudgetApp.Application.Categories;

public sealed class CategoryManagementService(
    ICategoryRepository categoryRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<CategoryTreeItem>> ListAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);

        var records = await categoryRepository.ListAsync(
            householdId,
            cancellationToken);
        var childrenByParent = records
            .Where(record => record.ParentCategoryId.HasValue)
            .GroupBy(record => record.ParentCategoryId!.Value)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<CategoryTreeItem>)group
                    .OrderBy(record => record.DisplayOrder)
                    .ThenBy(record => record.Name)
                    .Select(ToTreeItem)
                    .ToList());

        return records
            .Where(record => !record.ParentCategoryId.HasValue)
            .OrderBy(record => record.Type)
            .ThenBy(record => record.DisplayOrder)
            .ThenBy(record => record.Name)
            .Select(record => new CategoryTreeItem(
                record.Id,
                record.Name,
                record.Type.ToString(),
                record.DisplayOrder,
                record.IsActive,
                childrenByParent.GetValueOrDefault(record.Id, [])))
            .ToList();
    }

    public async Task<Guid> CreateAsync(
        Guid householdId,
        Guid userId,
        string name,
        string? type,
        Guid? parentCategoryId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);

        Category category;
        if (parentCategoryId.HasValue)
        {
            var parent = await GetCategory(householdId, parentCategoryId.Value, cancellationToken);
            await EnsureUniqueName(
                householdId,
                name,
                parent.Type,
                parent.Id,
                null,
                cancellationToken);
            var displayOrder = await categoryRepository.GetNextDisplayOrderAsync(
                householdId,
                parent.Type,
                parent.Id,
                cancellationToken);
            category = parent.AddSubcategory(name, displayOrder, timeProvider.GetUtcNow());
        }
        else
        {
            if (!Enum.TryParse<CategoryType>(type, ignoreCase: true, out var categoryType) ||
                !Enum.IsDefined(categoryType))
            {
                throw new ArgumentException("Category type is not supported.", nameof(type));
            }

            await EnsureUniqueName(
                householdId,
                name,
                categoryType,
                null,
                null,
                cancellationToken);
            var displayOrder = await categoryRepository.GetNextDisplayOrderAsync(
                householdId,
                categoryType,
                null,
                cancellationToken);
            category = Category.CreateRoot(
                householdId,
                name,
                categoryType,
                displayOrder,
                timeProvider.GetUtcNow());
        }

        await categoryRepository.AddAsync(category, cancellationToken);
        await categoryRepository.SaveChangesAsync(cancellationToken);
        return category.Id;
    }

    public async Task UpdateAsync(
        Guid householdId,
        Guid userId,
        Guid categoryId,
        string name,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        var category = await GetCategory(householdId, categoryId, cancellationToken);
        await EnsureUniqueName(
            householdId,
            name,
            category.Type,
            category.ParentCategoryId,
            category.Id,
            cancellationToken);

        category.Rename(name, timeProvider.GetUtcNow());
        await categoryRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task SetActiveAsync(
        Guid householdId,
        Guid userId,
        Guid categoryId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        var category = await GetCategory(householdId, categoryId, cancellationToken);

        if (isActive)
        {
            category.Reactivate(timeProvider.GetUtcNow());
        }
        else
        {
            category.Deactivate(timeProvider.GetUtcNow());
        }

        await categoryRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task ReorderAsync(
        Guid householdId,
        Guid userId,
        IReadOnlyList<Guid> orderedCategoryIds,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        if (orderedCategoryIds.Count == 0 ||
            orderedCategoryIds.Distinct().Count() != orderedCategoryIds.Count)
        {
            throw new ArgumentException(
                "Category order must contain unique category IDs.",
                nameof(orderedCategoryIds));
        }

        var categories = await categoryRepository.GetForUpdateAsync(
            householdId,
            orderedCategoryIds,
            cancellationToken);
        if (categories.Count != orderedCategoryIds.Count)
        {
            throw new CategoryNotFoundException();
        }

        var first = categories[0];
        if (categories.Any(category =>
                category.ParentCategoryId != first.ParentCategoryId ||
                category.Type != first.Type))
        {
            throw new ArgumentException(
                "Only sibling categories can be reordered together.",
                nameof(orderedCategoryIds));
        }

        var siblingIds = (await categoryRepository.ListAsync(
                householdId,
                cancellationToken))
            .Where(category =>
                category.ParentCategoryId == first.ParentCategoryId &&
                category.Type == first.Type)
            .Select(category => category.Id)
            .ToHashSet();
        if (!siblingIds.SetEquals(orderedCategoryIds))
        {
            throw new ArgumentException(
                "Category order must include every sibling category.",
                nameof(orderedCategoryIds));
        }

        var byId = categories.ToDictionary(category => category.Id);
        var updatedAtUtc = timeProvider.GetUtcNow();
        for (var index = 0; index < orderedCategoryIds.Count; index++)
        {
            byId[orderedCategoryIds[index]].SetDisplayOrder(index, updatedAtUtc);
        }

        await categoryRepository.SaveChangesAsync(cancellationToken);
    }

    private async Task<Category> GetCategory(
        Guid householdId,
        Guid categoryId,
        CancellationToken cancellationToken) =>
        await categoryRepository.GetForUpdateAsync(
            householdId,
            categoryId,
            cancellationToken) ?? throw new CategoryNotFoundException();

    private async Task EnsureUniqueName(
        Guid householdId,
        string name,
        CategoryType type,
        Guid? parentCategoryId,
        Guid? excludedCategoryId,
        CancellationToken cancellationToken)
    {
        var normalizedName = name.Trim().ToUpperInvariant();
        if (await categoryRepository.NameExistsAsync(
                householdId,
                normalizedName,
                type,
                parentCategoryId,
                excludedCategoryId,
                cancellationToken))
        {
            throw new CategoryConflictException(
                $"A category named '{name.Trim()}' already exists at this level.");
        }
    }

    private static CategoryTreeItem ToTreeItem(CategoryRecord record) =>
        new(
            record.Id,
            record.Name,
            record.Type.ToString(),
            record.DisplayOrder,
            record.IsActive,
            []);
}
