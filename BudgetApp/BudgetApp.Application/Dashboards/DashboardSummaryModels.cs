using BudgetApp.Application.Budgets;

namespace BudgetApp.Application.Dashboards;

public sealed record DashboardSummaryModel(
    BudgetSummaryModel Budget,
    int ReadyForReviewCount,
    int UncategorizedSpendingCount,
    bool HasActiveAccount,
    bool HasVisibleTransactions,
    IReadOnlyList<DashboardRecentTransaction>? Recent);

public sealed record DashboardRecentTransaction(
    Guid Id, string AccountName, string Currency, DateOnly TransactionDate,
    decimal Amount, string Description);

public sealed record DashboardActivityRecord(
    bool HasActiveAccount, bool HasVisibleTransactions, int UncategorizedSpendingCount,
    IReadOnlyList<DashboardRecentTransaction>? Recent);
