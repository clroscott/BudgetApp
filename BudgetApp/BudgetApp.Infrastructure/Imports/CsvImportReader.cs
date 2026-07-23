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
        "yyyy-MM-dd",
        "yyyyMMdd",
        "MM/dd/yyyy",
        "M/d/yyyy",
        "MM-dd-yyyy",
        "M-d-yyyy"
    ];

    public async Task<CsvImportReadResult> ReadAsync(
        Stream content,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(content);

        var bytes = await ReadWithinLimit(content, cancellationToken);
        if (bytes.Length == 0)
        {
            throw new CsvImportRejectedException("The selected CSV file is empty.");
        }

        var sha256Hash = Convert.ToHexString(SHA256.HashData(bytes));
        var rows = Parse(bytes, cancellationToken);
        if (rows.Count == 0)
        {
            throw new CsvImportRejectedException(
                "The CSV file does not contain any transaction rows.");
        }

        return new CsvImportReadResult(bytes.Length, sha256Hash, rows);
    }

    private static async Task<byte[]> ReadWithinLimit(
        Stream content,
        CancellationToken cancellationToken)
    {
        await using var buffer = new MemoryStream();
        var chunk = new byte[81920];

        while (true)
        {
            var bytesRead = await content.ReadAsync(chunk, cancellationToken);
            if (bytesRead == 0)
            {
                break;
            }

            if (buffer.Length + bytesRead > CsvImportLimits.MaxFileSizeBytes)
            {
                throw new CsvImportRejectedException(
                    $"CSV files cannot exceed {CsvImportLimits.MaxFileSizeBytes / 1024 / 1024} MB.");
            }

            await buffer.WriteAsync(
                chunk.AsMemory(0, bytesRead),
                cancellationToken);
        }

        return buffer.ToArray();
    }

    private static IReadOnlyList<CsvImportRow> Parse(
        byte[] bytes,
        CancellationToken cancellationToken)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var parser = new TextFieldParser(
                stream,
                new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true),
                detectEncoding: true,
                leaveOpen: false)
            {
                HasFieldsEnclosedInQuotes = true,
                TextFieldType = FieldType.Delimited,
                TrimWhiteSpace = false
            };
            parser.SetDelimiters(",");

            var headers = parser.ReadFields() ?? [];
            var columns = ResolveColumns(headers);
            var rows = new List<CsvImportRow>();
            var sourceRowNumber = 1;

            while (!parser.EndOfData)
            {
                cancellationToken.ThrowIfCancellationRequested();
                sourceRowNumber++;
                var fields = parser.ReadFields() ?? [];
                if (fields.All(string.IsNullOrWhiteSpace))
                {
                    continue;
                }

                if (rows.Count >= CsvImportLimits.MaxRows)
                {
                    throw new CsvImportRejectedException(
                        $"A CSV import cannot contain more than {CsvImportLimits.MaxRows:N0} rows.");
                }

                if (fields.Length != headers.Length)
                {
                    throw new CsvImportRejectedException(
                        $"CSV row {sourceRowNumber} contains {fields.Length} fields; " +
                        $"the header defines {headers.Length}.");
                }

                rows.Add(ParseRow(headers, fields, columns, sourceRowNumber));
            }

            return rows;
        }
        catch (CsvImportRejectedException)
        {
            throw;
        }
        catch (DecoderFallbackException)
        {
            throw new CsvImportRejectedException(
                "The CSV file is not valid UTF-8 text.");
        }
        catch (MalformedLineException exception)
        {
            throw new CsvImportRejectedException(
                $"The CSV file contains a malformed row near line {exception.LineNumber}.");
        }
    }

    private static CsvColumns ResolveColumns(string[] headers)
    {
        if (headers.Length == 0 || headers.All(string.IsNullOrWhiteSpace))
        {
            throw new CsvImportRejectedException("The CSV file must contain a header row.");
        }

        var normalizedHeaders = headers
            .Select(NormalizeHeader)
            .ToArray();
        if (normalizedHeaders.Any(string.IsNullOrEmpty))
        {
            throw new CsvImportRejectedException("CSV column names cannot be empty.");
        }

        if (normalizedHeaders.Distinct().Count() != normalizedHeaders.Length)
        {
            throw new CsvImportRejectedException("CSV column names must be unique.");
        }

        var dateIndex = FindColumn(
            normalizedHeaders,
            "transactiondate",
            "date",
            "posteddate");
        var descriptionIndex = FindColumn(
            normalizedHeaders,
            "description",
            "details",
            "memo",
            "merchant",
            "payee");
        var amountIndex = FindColumn(normalizedHeaders, "amount");
        var debitIndex = FindColumn(
            normalizedHeaders,
            "debit",
            "withdrawal",
            "withdrawals");
        var creditIndex = FindColumn(
            normalizedHeaders,
            "credit",
            "deposit",
            "deposits");
        var categoryIndex = FindColumn(normalizedHeaders, "category");
        var subcategoryIndex = FindColumn(
            normalizedHeaders,
            "subcategory",
            "subcat");

        if (dateIndex < 0)
        {
            throw UnsupportedHeaders(headers, "a Date or Transaction Date column");
        }

        if (descriptionIndex < 0)
        {
            throw UnsupportedHeaders(
                headers,
                "a Description, Details, Memo, Merchant, or Payee column");
        }

        if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)
        {
            throw UnsupportedHeaders(
                headers,
                "an Amount column or Debit/Credit columns");
        }

        return new CsvColumns(
            dateIndex,
            descriptionIndex,
            amountIndex,
            debitIndex,
            creditIndex,
            categoryIndex,
            subcategoryIndex);
    }

    private static CsvImportRejectedException UnsupportedHeaders(
        string[] headers,
        string requirement) =>
        new(
            $"The CSV layout is not recognized. It needs {requirement}. " +
            $"Found: {string.Join(", ", headers.Select(header => header.Trim()))}.");

    private static CsvImportRow ParseRow(
        string[] headers,
        string[] fields,
        CsvColumns columns,
        int sourceRowNumber)
    {
        var errors = new List<string>();
        var rawData = SerializeRawRow(headers, fields);
        var transactionDate = ParseDate(
            GetField(fields, columns.DateIndex),
            errors);
        var amount = columns.AmountIndex >= 0
            ? ParseSignedAmount(GetField(fields, columns.AmountIndex), errors)
            : ParseDebitCredit(
                GetField(fields, columns.DebitIndex),
                GetField(fields, columns.CreditIndex),
                errors);
        var description = GetField(fields, columns.DescriptionIndex)?.Trim();
        var categoryName = GetField(fields, columns.CategoryIndex)?.Trim();
        var subcategoryName = GetField(fields, columns.SubcategoryIndex)?.Trim();
        if (description?.Length > ImportTransactionDraft.ParsedDescriptionMaxLength)
        {
            errors.Add(
                $"Description exceeds {ImportTransactionDraft.ParsedDescriptionMaxLength} characters.");
            description = null;
        }

        return new CsvImportRow(
            sourceRowNumber,
            rawData,
            transactionDate,
            amount,
            string.IsNullOrWhiteSpace(description) ? null : description,
            string.IsNullOrWhiteSpace(categoryName) ? null : categoryName,
            string.IsNullOrWhiteSpace(subcategoryName) ? null : subcategoryName,
            errors.Count == 0 ? null : string.Join(" ", errors.Distinct()));
    }

    private static string SerializeRawRow(string[] headers, string[] fields)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < headers.Length; index++)
        {
            values[headers[index].Trim()] = GetField(fields, index);
        }

        var rawData = JsonSerializer.Serialize(values);
        if (rawData.Length > ImportTransactionDraft.RawDataMaxLength)
        {
            throw new CsvImportRejectedException(
                "A CSV row is too large to stage safely.");
        }

        return rawData;
    }

    private static DateOnly? ParseDate(string? value, ICollection<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (DateOnly.TryParseExact(
                value.Trim(),
                DateFormats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces,
                out var parsedDate))
        {
            return parsedDate;
        }

        errors.Add($"Date '{value.Trim()}' could not be parsed.");
        return null;
    }

    private static decimal? ParseSignedAmount(
        string? value,
        ICollection<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (TryParseDecimal(value, out var amount))
        {
            return amount;
        }

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
        decimal debit = 0;
        decimal credit = 0;

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

        if (!hasDebit && !hasCredit)
        {
            return null;
        }

        if (hasDebit && hasCredit && debit != 0 && credit != 0)
        {
            errors.Add("A row cannot contain both a debit and a credit amount.");
            return null;
        }

        return hasCredit && credit != 0
            ? -decimal.Abs(credit)
            : decimal.Abs(debit);
    }

    private static bool TryParseDecimal(string value, out decimal amount)
    {
        var normalizedValue = value
            .Trim()
            .Replace("CAD", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("USD", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Trim();

        return decimal.TryParse(
            normalizedValue,
            NumberStyles.Number |
            NumberStyles.AllowCurrencySymbol |
            NumberStyles.AllowParentheses,
            CultureInfo.InvariantCulture,
            out amount);
    }

    private static string? GetField(string[] fields, int index) =>
        index >= 0 && index < fields.Length ? fields[index] : null;

    private static int FindColumn(string[] headers, params string[] aliases)
    {
        foreach (var alias in aliases)
        {
            var index = Array.IndexOf(headers, alias);
            if (index >= 0)
            {
                return index;
            }
        }

        return -1;
    }

    private static string NormalizeHeader(string header) =>
        new(header
            .Trim()
            .Where(char.IsLetterOrDigit)
            .Select(char.ToLowerInvariant)
            .ToArray());

    private sealed record CsvColumns(
        int DateIndex,
        int DescriptionIndex,
        int AmountIndex,
        int DebitIndex,
        int CreditIndex,
        int CategoryIndex,
        int SubcategoryIndex);
}
