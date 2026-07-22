namespace BudgetApp.Application.Transactions;

public sealed record TransactionListItem(
    Guid Id,
    Guid AccountId,
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
    bool CanEdit);

public sealed record TransactionRecord(
    Guid Id,
    Guid AccountId,
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
    Guid? AccountOwnerUserId);

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
