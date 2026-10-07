using System.Globalization;

namespace BudgetApp.Application.Transactions;

// Filter intent is stored, not a resolved relative date, page number, or report origin.
public sealed record SavedTransactionFilterDefinition(
    string AccountId, string DateMode, string PastDays, string SpecificDate,
    string SpecificMonth, string FromDate, string ToDate, string CategoryType,
    string CategoryId, string SubcategoryId, string Description,
    string BudgetInclusion, string Currency, bool SpendingOnly)
{
    public const string Uncategorized = "__uncategorized__";

    public SavedTransactionFilterDefinition Normalize()
    {
        var account = ParseId(AccountId);
        var category = CategoryId == Uncategorized ? null : ParseId(CategoryId);
        var child = ParseId(SubcategoryId);
        if (child.HasValue && (!category.HasValue || CategoryId == Uncategorized))
            throw new ArgumentException("Choose a parent category for the subcategory.");
        if (CategoryId == Uncategorized && !string.IsNullOrEmpty(CategoryType))
            throw new ArgumentException("Uncategorized cannot be combined with a category type.");
        DateOnly? from = null, to = null;
        var days = "";
        switch (DateMode)
        {
            case "pastDays":
                if (!int.TryParse(PastDays, NumberStyles.None, CultureInfo.InvariantCulture, out var count) || count is < 1 or > 3650)
                    throw new ArgumentException("Past days must be a whole number between 1 and 3,650.");
                days = count.ToString(CultureInfo.InvariantCulture);
                break;
            case "specificDate": from = to = ParseDate(SpecificDate); break;
            case "specificMonth":
                if (!DateOnly.TryParseExact(SpecificMonth + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var first)) throw new ArgumentException("Choose a valid month.");
                from = first;
                to = new DateOnly(first.Year, first.Month, DateTime.DaysInMonth(first.Year, first.Month));
                break;
            case "range": from = ParseDate(FromDate); to = ParseDate(ToDate); break;
            case "all": break;
            default: throw new ArgumentException("Date filter is not supported.");
        }
        var criteria = TransactionSearchCriteria.Create(account, from, to, CategoryType,
            child ?? category, CategoryId == Uncategorized, Description, BudgetInclusion, Currency, SpendingOnly);
        return this with
        {
            AccountId = account?.ToString() ?? "", PastDays = days,
            SpecificDate = DateMode == "specificDate" ? Format(from) : "",
            SpecificMonth = DateMode == "specificMonth" ? SpecificMonth : "",
            FromDate = DateMode == "range" ? Format(from) : "",
            ToDate = DateMode == "range" ? Format(to) : "",
            CategoryType = criteria.CategoryType?.ToString() ?? "",
            CategoryId = CategoryId == Uncategorized ? Uncategorized : category?.ToString() ?? "",
            SubcategoryId = child?.ToString() ?? "", Description = criteria.DescriptionSearch ?? "",
            BudgetInclusion = criteria.BudgetInclusion ?? "", Currency = criteria.Currency ?? ""
        };
    }

    public static Guid? ParseId(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        if (!Guid.TryParse(value, out var id) || id == Guid.Empty)
            throw new ArgumentException("The filter contains an invalid account or category identifier.");
        return id;
    }
    private static DateOnly ParseDate(string? value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date : throw new ArgumentException("Choose a valid date.");
    private static string Format(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
}
