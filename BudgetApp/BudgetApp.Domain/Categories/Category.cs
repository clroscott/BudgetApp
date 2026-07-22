namespace BudgetApp.Domain.Categories;

public sealed class Category
{
    public const int NameMaxLength = 100;

    private readonly List<Category> _children = [];

    private Category()
    {
    }

    private Category(
        Guid id,
        Guid householdId,
        string name,
        CategoryType type,
        Guid? parentCategoryId,
        int displayOrder,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = householdId;
        SetName(name);
        Type = ValidateType(type);
        ParentCategoryId = parentCategoryId;
        DisplayOrder = ValidateDisplayOrder(displayOrder);
        IsActive = true;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string NormalizedName { get; private set; } = string.Empty;

    public CategoryType Type { get; private set; }

    public Guid? ParentCategoryId { get; private set; }

    public int DisplayOrder { get; private set; }

    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public Category? Parent { get; private set; }

    public IReadOnlyCollection<Category> Children => _children;

    public static Category CreateRoot(
        Guid householdId,
        string name,
        CategoryType type,
        int displayOrder,
        DateTimeOffset createdAtUtc)
    {
        if (householdId == Guid.Empty)
        {
            throw new ArgumentException(
                "Household ID is required.",
                nameof(householdId));
        }

        return new Category(
            Guid.NewGuid(),
            householdId,
            name,
            type,
            parentCategoryId: null,
            displayOrder,
            createdAtUtc);
    }

    public Category AddSubcategory(
        string name,
        int displayOrder,
        DateTimeOffset createdAtUtc)
    {
        if (ParentCategoryId.HasValue)
        {
            throw new InvalidOperationException(
                "Subcategories cannot contain another category.");
        }

        if (!IsActive)
        {
            throw new InvalidOperationException(
                "A subcategory cannot be added to a deactivated category.");
        }

        var normalizedName = NormalizeName(name);
        if (_children.Any(child => child.NormalizedName == normalizedName))
        {
            throw new InvalidOperationException(
                $"A subcategory named '{name.Trim()}' already exists.");
        }

        var child = new Category(
            Guid.NewGuid(),
            HouseholdId,
            name,
            Type,
            Id,
            displayOrder,
            createdAtUtc)
        {
            Parent = this
        };

        _children.Add(child);
        return child;
    }

    public void Rename(string name, DateTimeOffset updatedAtUtc)
    {
        SetName(name);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void SetDisplayOrder(int displayOrder, DateTimeOffset updatedAtUtc)
    {
        DisplayOrder = ValidateDisplayOrder(displayOrder);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Deactivate(DateTimeOffset updatedAtUtc)
    {
        if (_children.Any(child => child.IsActive))
        {
            throw new InvalidOperationException(
                "A category with active subcategories cannot be deactivated.");
        }

        IsActive = false;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Reactivate(DateTimeOffset updatedAtUtc)
    {
        if (ParentCategoryId.HasValue && Parent?.IsActive != true)
        {
            throw new InvalidOperationException(
                "The parent category must be active before this subcategory can be reactivated.");
        }

        IsActive = true;
        UpdatedAtUtc = updatedAtUtc;
    }

    private void SetName(string name)
    {
        var trimmedName = ValidateName(name);
        Name = trimmedName;
        NormalizedName = NormalizeName(trimmedName);
    }

    private static string ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Category name is required.", nameof(name));
        }

        var trimmedName = name.Trim();
        if (trimmedName.Length > NameMaxLength)
        {
            throw new ArgumentException(
                $"Category name cannot exceed {NameMaxLength} characters.",
                nameof(name));
        }

        return trimmedName;
    }

    private static string NormalizeName(string name) =>
        ValidateName(name).ToUpperInvariant();

    private static int ValidateDisplayOrder(int displayOrder)
    {
        if (displayOrder < 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(displayOrder),
                "Display order cannot be negative.");
        }

        return displayOrder;
    }

    private static CategoryType ValidateType(CategoryType type)
    {
        if (!Enum.IsDefined(type))
        {
            throw new ArgumentOutOfRangeException(
                nameof(type),
                "Category type is not supported.");
        }

        return type;
    }
}
