using BudgetApp.Domain.Categories;

namespace BudgetApp.Application.Transactions;

public sealed record TransactionSearchCriteria(
    Guid? AccountId,
    DateOnly? FromDate,
    DateOnly? ToDate,
    CategoryType? CategoryType,
    Guid? CategoryId,
    bool UncategorizedOnly,
    string? DescriptionSearch)
{
    public static TransactionSearchCriteria Create(
        Guid? accountId,
        DateOnly? fromDate,
        DateOnly? toDate,
        string? categoryType,
        Guid? categoryId,
        bool uncategorizedOnly,
        string? descriptionSearch)
    {
        if (fromDate > toDate)
        {
            throw new ArgumentException("From date cannot be after to date.");
        }

        CategoryType? parsedCategoryType = null;
        if (!string.IsNullOrWhiteSpace(categoryType))
        {
            if (!Enum.TryParse<CategoryType>(categoryType.Trim(), ignoreCase: true, out var parsed) ||
                !Enum.IsDefined(parsed))
            {
                throw new ArgumentException(
                    "Category type is not supported.",
                    nameof(categoryType));
            }

            parsedCategoryType = parsed;
        }

        var normalizedDescriptionSearch = string.IsNullOrWhiteSpace(descriptionSearch)
            ? null
            : descriptionSearch.Trim();
        if (normalizedDescriptionSearch?.Length > 250)
        {
            throw new ArgumentException(
                "Description search cannot exceed 250 characters.",
                nameof(descriptionSearch));
        }

        return new TransactionSearchCriteria(
            accountId,
            fromDate,
            toDate,
            parsedCategoryType,
            categoryId,
            uncategorizedOnly,
            normalizedDescriptionSearch);
    }
}
