using BudgetApp.Application.Imports;

namespace BudgetApp.Infrastructure.Imports;

// Application services depend on this format-neutral boundary. CSV is the only
// enabled format until workbook safeguards and worksheet selection land together.
public sealed class TransactionImportReader(CsvImportReader csvReader) : ITransactionImportReader
{
    public string ValidateFileName(string originalFileName)
    {
        if (string.IsNullOrWhiteSpace(originalFileName))
            throw new TransactionImportRejectedException("Select a CSV file to import.");
        var fileName = originalFileName.Trim();
        if (!string.Equals(Path.GetExtension(fileName), ".csv", StringComparison.OrdinalIgnoreCase))
            throw new TransactionImportRejectedException("Only .csv files are supported.");
        return fileName;
    }

    public Task<TransactionImportInspection> InspectAsync(
        Stream content, string originalFileName, CancellationToken cancellationToken)
    {
        ValidateFileName(originalFileName);
        return csvReader.InspectAsync(content, cancellationToken);
    }

    public Task<TransactionImportReadResult> ReadAsync(
        Stream content, string originalFileName, CancellationToken cancellationToken)
    {
        ValidateFileName(originalFileName);
        return csvReader.ReadAsync(content, cancellationToken);
    }

    public Task<TransactionImportReadResult> ReadAsync(
        Stream content, string originalFileName, ImportProfileDefinition profile, CancellationToken cancellationToken)
    {
        ValidateFileName(originalFileName);
        return csvReader.ReadAsync(content, profile, cancellationToken);
    }
}
