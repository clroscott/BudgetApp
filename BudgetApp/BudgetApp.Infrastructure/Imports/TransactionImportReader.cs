using BudgetApp.Application.Imports;

namespace BudgetApp.Infrastructure.Imports;

public sealed class TransactionImportReader(CsvImportReader csvReader, XlsxImportReader xlsxReader) : ITransactionImportReader
{
    public string ValidateFileName(string originalFileName)
    {
        if (string.IsNullOrWhiteSpace(originalFileName))
            throw new TransactionImportRejectedException("Select a CSV or Excel (.xlsx) file to import.");
        var fileName = originalFileName.Trim();
        if (Path.GetExtension(fileName).ToLowerInvariant() is not (".csv" or ".xlsx"))
            throw new TransactionImportRejectedException("Only .csv and .xlsx files are supported. Legacy .xls and macro-enabled workbooks are not supported.");
        return fileName;
    }

    public Task<TransactionImportInspection> InspectAsync(
        Stream content, string originalFileName, CancellationToken cancellationToken, string? worksheetId = null)
    {
        if (IsExcel(originalFileName)) return xlsxReader.InspectAsync(content, worksheetId, cancellationToken);
        RejectCsvWorksheet(worksheetId);
        return csvReader.InspectAsync(content, cancellationToken);
    }

    public Task<TransactionImportReadResult> ReadAsync(
        Stream content, string originalFileName, CancellationToken cancellationToken, string? worksheetId = null)
    {
        if (IsExcel(originalFileName)) return xlsxReader.ReadAsync(content, null, worksheetId, cancellationToken);
        RejectCsvWorksheet(worksheetId);
        return csvReader.ReadAsync(content, cancellationToken);
    }

    public Task<TransactionImportReadResult> ReadAsync(
        Stream content, string originalFileName, ImportProfileDefinition profile, CancellationToken cancellationToken, string? worksheetId = null)
    {
        if (IsExcel(originalFileName)) return xlsxReader.ReadAsync(content, profile, worksheetId, cancellationToken);
        RejectCsvWorksheet(worksheetId);
        return csvReader.ReadAsync(content, profile, cancellationToken);
    }

    private bool IsExcel(string name) => Path.GetExtension(ValidateFileName(name)).Equals(".xlsx", StringComparison.OrdinalIgnoreCase);
    private static void RejectCsvWorksheet(string? id)
    {
        if (id is not null) throw new TransactionImportRejectedException("CSV files do not have worksheets. Clear the worksheet selection.");
    }
}
