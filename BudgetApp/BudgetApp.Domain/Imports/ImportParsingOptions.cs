namespace BudgetApp.Domain.Imports;

public static class ImportParsingOptions
{
    public static string? ValidateDateFormat(string? value) => string.IsNullOrWhiteSpace(value) ? null :
        value is "yyyy-MM-dd" or "yyyyMMdd" or "MM/dd/yyyy" or "dd/MM/yyyy" ? value :
        throw new ArgumentException("Choose a supported text-date format.");

    public static string? ValidateNumberCulture(string? value) => string.IsNullOrWhiteSpace(value) ? null :
        value is "en-US" or "en-CA" or "en-GB" or "fr-CA" or "de-DE" ? value :
        throw new ArgumentException("Choose a supported number format.");
}
