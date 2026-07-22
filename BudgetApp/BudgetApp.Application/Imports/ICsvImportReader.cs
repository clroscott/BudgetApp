namespace BudgetApp.Application.Imports;

public interface ICsvImportReader
{
    Task<CsvImportReadResult> ReadAsync(
        Stream content,
        CancellationToken cancellationToken);
}
