namespace BudgetApp.Application.Imports;

public sealed record CsvImportRow(
    int SourceRowNumber,
    string RawData,
    DateOnly? TransactionDate,
    decimal? Amount,
    string? Description,
    string? ValidationMessage);

public sealed record CsvImportReadResult(
    long FileSizeBytes,
    string Sha256Hash,
    IReadOnlyList<CsvImportRow> Rows);

public sealed record CsvImportResult(
    Guid ImportFileId,
    string OriginalFileName,
    string AccountName,
    string Status,
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    int DuplicateRows);
