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
    IReadOnlyList<TransactionImportRow> Rows,
    string? SourceWorksheetId = null,
    string? SourceWorksheetName = null);

public sealed record TransactionImportResult(
    Guid ImportFileId,
    string OriginalFileName,
    string AccountName,
    string Status,
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    int DuplicateRows,
    string? SourceWorksheetName = null);

public sealed record ImportWorksheetOption(
    string Id,
    string Name,
    bool IsHidden,
    int TransactionRows,
    string? Problem);
