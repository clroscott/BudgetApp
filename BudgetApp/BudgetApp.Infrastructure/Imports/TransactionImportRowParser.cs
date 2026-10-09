using System.Globalization;
using System.Text.Json;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;

namespace BudgetApp.Infrastructure.Imports;

// Format readers decode their own file/cell representation. Column matching,
// signs, date/decimal parsing and row validation have one shared interpretation.
// CSV defaults preserve the existing messages; another reader supplies its label.
internal static class TransactionImportRowParser
{
    private static readonly string[] DateFormats =
    [
        "yyyy-MM-dd", "yyyyMMdd", "MM/dd/yyyy", "M/d/yyyy",
        "MM-dd-yyyy", "M-d-yyyy"
    ];

    public static ImportColumnMapping ResolveColumns(
        IReadOnlyList<string> headers,
        bool requireRecognized,
        string sourceFormat = "CSV")
    {
        var normalized = headers.Select(NormalizeHeader).ToArray();
        var date = FindColumn(normalized, "transactiondate", "date", "posteddate");
        var description = FindColumn(
            normalized, "description", "details", "memo", "merchant", "payee");
        var amount = FindColumn(normalized, "amount");
        var debit = FindColumn(normalized, "debit", "withdrawal", "withdrawals");
        var credit = FindColumn(normalized, "credit", "deposit", "deposits");
        var category = FindColumn(normalized, "category");
        var subcategory = FindColumn(normalized, "subcategory", "subcat");
        if (requireRecognized && date < 0)
            throw UnsupportedHeaders(headers, "a Date or Transaction Date column", sourceFormat);
        if (requireRecognized && description < 0)
            throw UnsupportedHeaders(headers, "a Description, Details, Memo, Merchant, or Payee column", sourceFormat);
        if (requireRecognized && amount < 0 && debit < 0 && credit < 0)
            throw UnsupportedHeaders(headers, "an Amount column or Debit/Credit columns", sourceFormat);
        return new ImportColumnMapping(date, description, amount, debit, credit, category, subcategory);
    }

    public static ImportColumnMapping ResolveProfileColumns(
        IReadOnlyList<string> headers,
        ImportProfileDefinition profile)
    {
        if (ImportProfile.BuildHeaderSignature(headers) !=
            ImportProfile.BuildHeaderSignature(profile.Headers))
            throw new TransactionImportRejectedException(
                $"This file does not match the selected profile '{profile.Name}'.");
        var normalized = headers.Select(NormalizeHeader).ToArray();
        int Find(string? name) => string.IsNullOrWhiteSpace(name)
            ? -1
            : Array.IndexOf(normalized, NormalizeHeader(name));
        return new ImportColumnMapping(
            Find(profile.DateColumn), Find(profile.DescriptionColumn),
            Find(profile.AmountColumn), Find(profile.DebitColumn),
            Find(profile.CreditColumn), Find(profile.CategoryColumn),
            Find(profile.SubcategoryColumn));
    }

    public static TransactionImportRow ParseRow(
        string[] headers,
        string[] fields,
        ImportColumnMapping columns,
        int sourceRowNumber,
        ImportAmountConvention convention,
        string sourceFormat = "CSV", string? dateFormat = null, string? numberCulture = null)
    {
        var errors = new List<string>();
        var amount = columns.AmountIndex >= 0
            ? ParseAmount(GetField(fields, columns.AmountIndex), errors, numberCulture)
            : ParseDebitCredit(
                GetField(fields, columns.DebitIndex),
                GetField(fields, columns.CreditIndex),
                errors, numberCulture);
        if (amount.HasValue &&
            columns.AmountIndex >= 0 &&
            convention == ImportAmountConvention.MoneyInPositive)
            amount = -amount.Value;
        var description = GetField(fields, columns.DescriptionIndex)?.Trim();
        if (description?.Length > ImportTransactionDraft.ParsedDescriptionMaxLength)
        {
            errors.Add(
                $"Description exceeds {ImportTransactionDraft.ParsedDescriptionMaxLength} characters.");
            description = null;
        }
        return new TransactionImportRow(
            sourceRowNumber,
            SerializeRawRow(headers, fields, sourceFormat),
            ParseDate(GetField(fields, columns.DateIndex), errors, dateFormat),
            amount,
            string.IsNullOrWhiteSpace(description) ? null : description,
            CleanOptional(GetField(fields, columns.CategoryIndex)),
            CleanOptional(GetField(fields, columns.SubcategoryIndex)),
            errors.Count == 0 ? null : string.Join(" ", errors.Distinct()));
    }

    private static DateOnly? ParseDate(string? value, ICollection<string> errors, string? dateFormat)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (DateOnly.TryParseExact(
            value.Trim(), dateFormat is null ? DateFormats : [dateFormat], CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces, out var result))
            return result;
        errors.Add($"Date '{value.Trim()}' could not be parsed.");
        return null;
    }

    private static decimal? ParseAmount(string? value, ICollection<string> errors, string? numberCulture)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (TryParseDecimal(value, numberCulture, out var result)) return result;
        errors.Add($"Amount '{value.Trim()}' could not be parsed.");
        return null;
    }

    private static decimal? ParseDebitCredit(
        string? debitValue,
        string? creditValue,
        ICollection<string> errors, string? numberCulture)
    {
        var hasDebit = !string.IsNullOrWhiteSpace(debitValue);
        var hasCredit = !string.IsNullOrWhiteSpace(creditValue);
        var debit = 0m;
        var credit = 0m;
        if (hasDebit && !TryParseDecimal(debitValue!, numberCulture, out debit))
        {
            errors.Add($"Debit '{debitValue!.Trim()}' could not be parsed.");
            hasDebit = false;
        }
        if (hasCredit && !TryParseDecimal(creditValue!, numberCulture, out credit))
        {
            errors.Add($"Credit '{creditValue!.Trim()}' could not be parsed.");
            hasCredit = false;
        }
        if (!hasDebit && !hasCredit) return null;
        if (hasDebit && hasCredit && debit != 0 && credit != 0)
        {
            errors.Add("A row cannot contain both a debit and a credit amount.");
            return null;
        }
        return hasCredit && credit != 0 ? -decimal.Abs(credit) : decimal.Abs(debit);
    }

    private static bool TryParseDecimal(string value, string? numberCulture, out decimal amount)
    {
        var normalized = value.Trim()
            .Replace("CAD", "", StringComparison.OrdinalIgnoreCase)
            .Replace("USD", "", StringComparison.OrdinalIgnoreCase).Trim();
        return decimal.TryParse(
            normalized,
            NumberStyles.Number | NumberStyles.AllowCurrencySymbol |
            NumberStyles.AllowParentheses,
            numberCulture is null ? CultureInfo.InvariantCulture : CultureInfo.GetCultureInfo(numberCulture),
            out amount);
    }

    public static string SerializeRawRow(string[] headers, string[] fields, string sourceFormat)
    {
        var values = headers.Select((header, index) =>
            new KeyValuePair<string, string?>(header.Trim(), GetField(fields, index)))
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
        var raw = JsonSerializer.Serialize(values);
        if (raw.Length > ImportTransactionDraft.RawDataMaxLength)
            throw new TransactionImportRejectedException($"A {sourceFormat} row is too large to stage safely.");
        return raw;
    }

    public static ImportProfileDefinition CreateSuggestedProfile(
        IReadOnlyList<string> headers,
        ImportColumnMapping columns,
        string sourceFormat = "CSV")
    {
        string? At(int index) => index >= 0 ? headers[index] : null;
        return new ImportProfileDefinition(
            null, $"New {sourceFormat} profile", headers,
            At(columns.DateIndex) ?? "",
            At(columns.DescriptionIndex) ?? "",
            At(columns.AmountIndex), At(columns.DebitIndex),
            At(columns.CreditIndex), At(columns.CategoryIndex),
            At(columns.SubcategoryIndex),
            ImportAmountConvention.SpendingPositive);
    }

    public static void ValidateHeaders(IReadOnlyList<string> headers, string sourceFormat = "CSV")
    {
        if (headers.Count == 0 || headers.All(string.IsNullOrWhiteSpace))
            throw new TransactionImportRejectedException($"The {sourceFormat} file must contain a header row.");
        var normalized = headers.Select(NormalizeHeader).ToArray();
        if (normalized.Any(string.IsNullOrEmpty))
            throw new TransactionImportRejectedException($"{sourceFormat} column names cannot be empty.");
        if (normalized.Distinct().Count() != normalized.Length)
            throw new TransactionImportRejectedException($"{sourceFormat} column names must be unique.");
    }

    private static TransactionImportRejectedException UnsupportedHeaders(
        IReadOnlyList<string> headers,
        string requirement,
        string sourceFormat) =>
        new(
            $"The {sourceFormat} layout is not recognized. It needs {requirement}. " +
            $"Found: {string.Join(", ", headers.Select(header => header.Trim()))}.");

    private static int FindColumn(string[] headers, params string[] aliases)
    {
        foreach (var alias in aliases)
        {
            var index = Array.IndexOf(headers, alias);
            if (index >= 0) return index;
        }
        return -1;
    }

    private static string NormalizeHeader(string header) =>
        new(header.Trim().Where(char.IsLetterOrDigit)
            .Select(char.ToLowerInvariant).ToArray());

    private static string? GetField(string[] fields, int index) =>
        index >= 0 && index < fields.Length ? fields[index] : null;

    private static string? CleanOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public sealed record ImportColumnMapping(
        int DateIndex,
        int DescriptionIndex,
        int AmountIndex,
        int DebitIndex,
        int CreditIndex,
        int CategoryIndex,
        int SubcategoryIndex);
}
