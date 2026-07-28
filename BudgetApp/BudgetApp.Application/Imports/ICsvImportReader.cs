namespace BudgetApp.Application.Imports;

public interface ICsvImportReader
{
    Task<CsvStructureInspection> InspectAsync(
        Stream content,
        CancellationToken cancellationToken);

    Task<CsvImportReadResult> ReadAsync(
        Stream content,
        CancellationToken cancellationToken);

    Task<CsvImportReadResult> ReadAsync(
        Stream content,
        CsvProfileDefinition profile,
        CancellationToken cancellationToken);
}
