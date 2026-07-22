using System.Globalization;

namespace BudgetApp.Application.Finance;

public static class CurrencyCatalog
{
    private static readonly HashSet<string> SupportedCodes =
        CultureInfo.GetCultures(CultureTypes.SpecificCultures)
            .Select(culture => new RegionInfo(culture.Name).ISOCurrencySymbol)
            .Where(code => code.Length == 3)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

    public static string NormalizeSupported(string currencyCode)
    {
        if (string.IsNullOrWhiteSpace(currencyCode))
        {
            throw new ArgumentException(
                "Currency is required.",
                nameof(currencyCode));
        }

        var normalizedCode = currencyCode.Trim().ToUpperInvariant();
        if (!SupportedCodes.Contains(normalizedCode))
        {
            throw new UnsupportedCurrencyException(normalizedCode);
        }

        return normalizedCode;
    }
}
