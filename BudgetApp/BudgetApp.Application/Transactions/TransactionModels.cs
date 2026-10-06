namespace BudgetApp.Application.Transactions;

public sealed record TransactionListItem(
    Guid Id,
    Guid? AccountId,
    string AccountName,
    string Currency,
    Guid? CategoryId,
    string? CategoryName,
    DateOnly TransactionDate,
    DateOnly? PostedDate,
    decimal Amount,
    string Description,
    string? MerchantName,
    string? Notes,
    string Source,
    string ReviewStatus,
    bool IsExcludedFromBudget,
    bool IsVoided,
    bool CanEdit,
    bool IncludeInHouseholdBudget,
    bool IncludeInPersonalBudget,
    bool CanEditHouseholdInclusion,
    DateTimeOffset UpdatedAtUtc);

public sealed record TransactionRecord(
    Guid Id,
    Guid? AccountId,
    string AccountName,
    string Currency,
    Guid? CategoryId,
    string? CategoryName,
    DateOnly TransactionDate,
    DateOnly? PostedDate,
    decimal Amount,
    string Description,
    string? MerchantName,
    string? Notes,
    string Source,
    string ReviewStatus,
    bool IsExcludedFromBudget,
    bool IsVoided,
    bool IsPersonalAccount,
    Guid? AccountOwnerUserId,
    bool IncludeInHouseholdBudget,
    bool IncludeInPersonalBudget,
    DateTimeOffset UpdatedAtUtc);

public sealed record TransactionListResult(
    IReadOnlyList<TransactionListItem> Items,
    bool HasMore,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public sealed record TransactionQueryResult(
    IReadOnlyList<TransactionRecord> Items,
    int TotalCount);

public sealed record TransactionExportRecord(
    string AccountName,
    string Currency,
    string? CategoryName,
    string? SubcategoryName,
    DateOnly TransactionDate,
    decimal Amount,
    string Description,
    string? Notes,
    bool IsExcludedFromBudget,
    bool IncludeInHouseholdBudget,
    bool IncludeInPersonalBudget);

public sealed record TransactionCsvExport(
    byte[] Content,
    string FileName,
    int TransactionCount);
