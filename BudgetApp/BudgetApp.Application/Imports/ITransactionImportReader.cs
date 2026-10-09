namespace BudgetApp.Application.Imports;

public interface ITransactionImportReader
{
    // Validate supported formats without consuming the stream. Callers can
    // retain the existing validation/authorization order before reading data.
    string ValidateFileName(string originalFileName);

    Task<TransactionImportInspection> InspectAsync(
        Stream content,
        string originalFileName,
        CancellationToken cancellationToken);

    Task<TransactionImportReadResult> ReadAsync(
        Stream content,
        string originalFileName,
        CancellationToken cancellationToken);

    Task<TransactionImportReadResult> ReadAsync(
        Stream content,
        string originalFileName,
        ImportProfileDefinition profile,
        CancellationToken cancellationToken);
}
