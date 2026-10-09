using BudgetApp.Application.Budgets;
using BudgetApp.Application.Imports;

namespace BudgetApp.Application.Dashboards;

public sealed class DashboardSummaryService(
    BudgetManagementService budgets,
    IImportRepository imports,
    IDashboardSummaryRepository repository)
{
    public async Task<DashboardSummaryModel> GetAsync(
        Guid householdId, Guid userId, int year, int month, string scope,
        bool includeRecent, CancellationToken cancellationToken)
    {
        // The budget read validates context and requires active household access
        // before any other data is read. Queries share a scoped DbContext, so
        // execute sequentially rather than starting concurrent operations on it.
        var budget = await budgets.GetSummaryAsync(householdId, userId, year, month, scope, cancellationToken);
        var importSummary = await imports.GetSummaryAsync(householdId, userId, cancellationToken);
        var activity = await repository.GetActivityAsync(
            householdId, userId, year, month, budget.Scope, budget.Currency, includeRecent, cancellationToken);
        return new(budget, importSummary.ReadyForReviewCount, activity.UncategorizedSpendingCount,
            activity.HasActiveAccount, activity.HasVisibleTransactions, activity.Recent);
    }
}
