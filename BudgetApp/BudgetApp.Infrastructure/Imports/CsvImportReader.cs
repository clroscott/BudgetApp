using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using Microsoft.VisualBasic.FileIO;

namespace BudgetApp.Infrastructure.Imports;

public sealed class CsvImportReader : ICsvImportReader
{
    private static readonly string[] DateFormats =
    [
        "yyyy-MM-dd", "yyyyMMdd", "MM/dd/yyyy", "M/d/yyyy",
        "MM-dd-yyyy", "M-d-yyyy"
    ];

    public Task<CsvImportReadResult> ReadAsync(
        Stream content,
        CancellationToken cancellationToken) =>
        ReadCoreAsync(content, profile: null, cancellationToken);

    public Task<CsvImportReadResult> ReadAsync(
        Stream content,
        CsvProfileDefinition profile,
        CancellationToken cancellationToken) =>
        ReadCoreAsync(content, profile, cancellationToken);

    public async Task<CsvStructureInspection> InspectAsync(
        Stream content,
        CancellationToken cancellationToken)
    {
        var bytes = await ReadWithinLimit(content, cancellationToken);
        if (bytes.Length == 0)
            throw new CsvImportRejectedException("The selected CSV file is empty.");
        var document = ReadDocument(bytes, maximumRows: 5, cancellationToken);
        var columns = ResolveColumns(document.Headers, requireRecognized: false);
        return new CsvStructureInspection(
            bytes.Length,
            Convert.ToHexString(SHA256.HashData(bytes)),
            document.Headers,
            document.Rows,
            CreateSuggestedProfile(document.Headers, columns));
    }

    private static async Task<CsvImportReadResult> ReadCoreAsync(
        Stream content,
        CsvProfileDefinition? profile,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(content);
        var bytes = await ReadWithinLimit(content, cancellationToken);
        if (bytes.Length == 0)
            throw new CsvImportRejectedException("The selected CSV file is empty.");
        var document = ReadDocument(bytes, CsvImportLimits.MaxRows + 1, cancellationToken);
        if (document.Rows.Count == 0)
            throw new CsvImportRejectedException(
                "The CSV file does not contain any transaction rows.");
        if (document.Rows.Count > CsvImportLimits.MaxRows)
            throw new CsvImportRejectedException(
                $"A CSV import cannot contain more than {CsvImportLimits.MaxRows:N0} rows.");

        var columns = profile is null
            ? ResolveColumns(document.Headers, requireRecognized: true)
            : ResolveProfileColumns(document.Headers, profile);
        var rows = document.Rows
            .Select((fields, index) => ParseRow(
                document.Headers.ToArray(),
                fields.ToArray(),
                columns,
                index + 2,
                profile?.AmountConvention ?? ImportAmountConvention.SpendingPositive))
            .ToList();
        return new CsvImportReadResult(
            bytes.Length,
            Convert.ToHexString(SHA256.HashData(bytes)),
            rows);
    }

    private static async Task<byte[]> ReadWithinLimit(
        Stream content,
        CancellationToken cancellationToken)
    {
        await using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        while (true)
        {
            var count = await content.ReadAsync(chunk, cancellationToken);
            if (count == 0) break;
            if (buffer.Length + count > CsvImportLimits.MaxFileSizeBytes)
                throw new CsvImportRejectedException(
                    $"CSV files cannot exceed {CsvImportLimits.MaxFileSizeBytes / 1024 / 1024} MB.");
            await buffer.WriteAsync(chunk.AsMemory(0, count), cancellationToken);
        }
        return buffer.ToArray();
    }

    private static CsvDocument ReadDocument(
        byte[] bytes,
        int maximumRows,
        CancellationToken cancellationToken)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var parser = new TextFieldParser(
                stream, new UTF8Encoding(false, true), true, false)
            {
                HasFieldsEnclosedInQuotes = true,
                TextFieldType = FieldType.Delimited,
                TrimWhiteSpace = false
            };
            parser.SetDelimiters(",");
            var headers = parser.ReadFields() ?? [];
            ValidateHeaders(headers);
            var rows = new List<IReadOnlyList<string>>();
            while (!parser.EndOfData && rows.Count < maximumRows)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var fields = parser.ReadFields() ?? [];
                if (fields.All(string.IsNullOrWhiteSpace)) continue;
                if (fields.Length != headers.Length)
                    throw new CsvImportRejectedException(
                        $"CSV row {rows.Count + 2} contains {fields.Length} fields; " +
                        $"the header defines {headers.Length}.");
                rows.Add(fields);
            }
            return new CsvDocument(headers, rows);
        }
        catch (CsvImportRejectedException)
        {
            throw;
        }
        catch (DecoderFallbackException)
        {
            throw new CsvImportRejectedException("The CSV file is not valid UTF-8 text.");
        }
        catch (MalformedLineException exception)
        {
            throw new CsvImportRejectedException(
                $"The CSV file contains a malformed row near line {exception.LineNumber}.");
        }
    }

    private static CsvColumns ResolveColumns(
        IReadOnlyList<string> headers,
        bool requireRecognized)
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
            throw UnsupportedHeaders(headers, "a Date or Transaction Date column");
        if (requireRecognized && description < 0)
            throw UnsupportedHeaders(headers, "a Description, Details, Memo, Merchant, or Payee column");
        if (requireRecognized && amount < 0 && debit < 0 && credit < 0)
            throw UnsupportedHeaders(headers, "an Amount column or Debit/Credit columns");
        return new CsvColumns(date, description, amount, debit, credit, category, subcategory);
    }

    private static CsvColumns ResolveProfileColumns(
        IReadOnlyList<string> headers,
        CsvProfileDefinition profile)
    {
        if (ImportProfile.BuildHeaderSignature(headers) !=
            ImportProfile.BuildHeaderSignature(profile.Headers))
            throw new CsvImportRejectedException(
                $"This file does not match the selected profile '{profile.Name}'.");
        var normalized = headers.Select(NormalizeHeader).ToArray();
        int Find(string? name) => string.IsNullOrWhiteSpace(name)
            ? -1
            : Array.IndexOf(normalized, NormalizeHeader(name));
        return new CsvColumns(
            Find(profile.DateColumn), Find(profile.DescriptionColumn),
            Find(profile.AmountColumn), Find(profile.DebitColumn),
            Find(profile.CreditColumn), Find(profile.CategoryColumn),
            Find(profile.SubcategoryColumn));
    }

    private static CsvImportRow ParseRow(
        string[] headers,
        string[] fields,
        CsvColumns columns,
        int sourceRowNumber,
        ImportAmountConvention convention)
    {
        var errors = new List<string>();
        var amount = columns.AmountIndex >= 0
            ? ParseAmount(GetField(fields, columns.AmountIndex), errors)
            : ParseDebitCredit(
                GetField(fields, columns.DebitIndex),
                GetField(fields, columns.CreditIndex),
                errors);
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
        return new CsvImportRow(
            sourceRowNumber,
            SerializeRawRow(headers, fields),
            ParseDate(GetField(fields, columns.DateIndex), errors),
            amount,
            string.IsNullOrWhiteSpace(description) ? null : description,
            CleanOptional(GetField(fields, columns.CategoryIndex)),
            CleanOptional(GetField(fields, columns.SubcategoryIndex)),
            errors.Count == 0 ? null : string.Join(" ", errors.Distinct()));
    }

    private static DateOnly? ParseDate(string? value, ICollection<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (DateOnly.TryParseExact(
            value.Trim(), DateFormats, CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces, out var result))
            return result;
        errors.Add($"Date '{value.Trim()}' could not be parsed.");
        return null;
    }

    private static decimal? ParseAmount(string? value, ICollection<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (TryParseDecimal(value, out var result)) return result;
        errors.Add($"Amount '{value.Trim()}' could not be parsed.");
        return null;
    }

    private static decimal? ParseDebitCredit(
        string? debitValue,
        string? creditValue,
        ICollection<string> errors)
    {
        var hasDebit = !string.IsNullOrWhiteSpace(debitValue);
        var hasCredit = !string.IsNullOrWhiteSpace(creditValue);
        var debit = 0m;
        var credit = 0m;
        if (hasDebit && !TryParseDecimal(debitValue!, out debit))
        {
            errors.Add($"Debit '{debitValue!.Trim()}' could not be parsed.");
            hasDebit = false;
        }
        if (hasCredit && !TryParseDecimal(creditValue!, out credit))
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

    private static bool TryParseDecimal(string value, out decimal amount)
    {
        var normalized = value.Trim()
            .Replace("CAD", "", StringComparison.OrdinalIgnoreCase)
            .Replace("USD", "", StringComparison.OrdinalIgnoreCase).Trim();
        return decimal.TryParse(
            normalized,
            NumberStyles.Number | NumberStyles.AllowCurrencySymbol |
            NumberStyles.AllowParentheses,
            CultureInfo.InvariantCulture,
            out amount);
    }

    private static string SerializeRawRow(string[] headers, string[] fields)
    {
        var values = headers.Select((header, index) =>
            new KeyValuePair<string, string?>(header.Trim(), GetField(fields, index)))
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
        var raw = JsonSerializer.Serialize(values);
        if (raw.Length > ImportTransactionDraft.RawDataMaxLength)
            throw new CsvImportRejectedException("A CSV row is too large to stage safely.");
        return raw;
    }

    private static CsvProfileDefinition CreateSuggestedProfile(
        IReadOnlyList<string> headers,
        CsvColumns columns)
    {
        string? At(int index) => index >= 0 ? headers[index] : null;
        return new CsvProfileDefinition(
            null, "New CSV profile", headers,
            At(columns.DateIndex) ?? "",
            At(columns.DescriptionIndex) ?? "",
            At(columns.AmountIndex), At(columns.DebitIndex),
            At(columns.CreditIndex), At(columns.CategoryIndex),
            At(columns.SubcategoryIndex),
            ImportAmountConvention.SpendingPositive);
    }

    private static void ValidateHeaders(IReadOnlyList<string> headers)
    {
        if (headers.Count == 0 || headers.All(string.IsNullOrWhiteSpace))
            throw new CsvImportRejectedException("The CSV file must contain a header row.");
        var normalized = headers.Select(NormalizeHeader).ToArray();
        if (normalized.Any(string.IsNullOrEmpty))
            throw new CsvImportRejectedException("CSV column names cannot be empty.");
        if (normalized.Distinct().Count() != normalized.Length)
            throw new CsvImportRejectedException("CSV column names must be unique.");
    }

    private static CsvImportRejectedException UnsupportedHeaders(
        IReadOnlyList<string> headers,
        string requirement) =>
        new(
            $"The CSV layout is not recognized. It needs {requirement}. " +
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

    private sealed record CsvColumns(
        int DateIndex,
        int DescriptionIndex,
        int AmountIndex,
        int DebitIndex,
        int CreditIndex,
        int CategoryIndex,
        int SubcategoryIndex);

    private sealed record CsvDocument(
        IReadOnlyList<string> Headers,
        IReadOnlyList<IReadOnlyList<string>> Rows);
}
