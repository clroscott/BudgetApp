namespace BudgetApp.Application.Imports;

public sealed record TransactionImportRow(
    int SourceRowNumber,
    string RawData,
    DateOnly? TransactionDate,
    decimal? Amount,
    string? Description,
    string? CategoryName,
    string? SubcategoryName,
    string? ValidationMessage);

public sealed record TransactionImportReadResult(
    long FileSizeBytes,
    string Sha256Hash,
    IReadOnlyList<TransactionImportRow> Rows);

public sealed record TransactionImportResult(
    Guid ImportFileId,
    string OriginalFileName,
    string AccountName,
    string Status,
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    int DuplicateRows);
