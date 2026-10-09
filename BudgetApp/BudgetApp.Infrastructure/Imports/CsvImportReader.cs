using System.Security.Cryptography;
using System.Text;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using Microsoft.VisualBasic.FileIO;
using static BudgetApp.Infrastructure.Imports.TransactionImportRowParser;

namespace BudgetApp.Infrastructure.Imports;

public sealed class CsvImportReader
{
    public Task<TransactionImportReadResult> ReadAsync(
        Stream content,
        CancellationToken cancellationToken) =>
        ReadCoreAsync(content, profile: null, cancellationToken);

    public Task<TransactionImportReadResult> ReadAsync(
        Stream content,
        ImportProfileDefinition profile,
        CancellationToken cancellationToken) =>
        ReadCoreAsync(content, profile, cancellationToken);

    public async Task<TransactionImportInspection> InspectAsync(
        Stream content,
        CancellationToken cancellationToken)
    {
        var bytes = await ReadWithinLimit(content, cancellationToken);
        if (bytes.Length == 0)
            throw new TransactionImportRejectedException("The selected CSV file is empty.");
        var document = ReadDocument(bytes, maximumRows: 5, cancellationToken);
        var columns = ResolveColumns(document.Headers, requireRecognized: false);
        return new TransactionImportInspection(
            bytes.Length,
            Convert.ToHexString(SHA256.HashData(bytes)),
            document.Headers,
            document.Rows,
            CreateSuggestedProfile(document.Headers, columns));
    }

    private static async Task<TransactionImportReadResult> ReadCoreAsync(
        Stream content,
        ImportProfileDefinition? profile,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(content);
        var bytes = await ReadWithinLimit(content, cancellationToken);
        if (bytes.Length == 0)
            throw new TransactionImportRejectedException("The selected CSV file is empty.");
        var document = ReadDocument(bytes, TransactionImportLimits.MaxRows + 1, cancellationToken);
        if (document.Rows.Count == 0)
            throw new TransactionImportRejectedException(
                "The CSV file does not contain any transaction rows.");
        if (document.Rows.Count > TransactionImportLimits.MaxRows)
            throw new TransactionImportRejectedException(
                $"A CSV import cannot contain more than {TransactionImportLimits.MaxRows:N0} rows.");

        var columns = profile is null
            ? ResolveColumns(document.Headers, requireRecognized: true)
            : ResolveProfileColumns(document.Headers, profile);
        var rows = document.Rows
            .Select((fields, index) => ParseRow(
                document.Headers.ToArray(),
                fields.ToArray(),
                columns,
                index + 2,
                profile?.AmountConvention ?? ImportAmountConvention.SpendingPositive,
                dateFormat: profile?.DateFormat, numberCulture: profile?.NumberCulture))
            .ToList();
        return new TransactionImportReadResult(
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
            if (buffer.Length + count > TransactionImportLimits.MaxFileSizeBytes)
                throw new TransactionImportRejectedException(
                    $"CSV files cannot exceed {TransactionImportLimits.MaxFileSizeBytes / 1024 / 1024} MB.");
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
                    throw new TransactionImportRejectedException(
                        $"CSV row {rows.Count + 2} contains {fields.Length} fields; " +
                        $"the header defines {headers.Length}.");
                rows.Add(fields);
            }
            return new CsvDocument(headers, rows);
        }
        catch (TransactionImportRejectedException)
        {
            throw;
        }
        catch (DecoderFallbackException)
        {
            throw new TransactionImportRejectedException("The CSV file is not valid UTF-8 text.");
        }
        catch (MalformedLineException exception)
        {
            throw new TransactionImportRejectedException(
                $"The CSV file contains a malformed row near line {exception.LineNumber}.");
        }
    }

    private sealed record CsvDocument(
        IReadOnlyList<string> Headers,
        IReadOnlyList<IReadOnlyList<string>> Rows);
}
