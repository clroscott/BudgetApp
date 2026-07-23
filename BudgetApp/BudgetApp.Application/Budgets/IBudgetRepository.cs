using BudgetApp.Domain.Budgeting;

namespace BudgetApp.Application.Budgets;

public interface IBudgetRepository
{
    Task<BudgetMonth?> GetAsync(
        Guid householdId,
        int year,
        int month,
        BudgetScope scope,
        Guid? ownerUserId,
        bool forUpdate,
        CancellationToken cancellationToken);

    Task<BudgetMonth?> GetByIdForUpdateAsync(
        Guid householdId,
        Guid budgetId,
        Guid userId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<BudgetMonthOption>> ListAvailableAsync(
        Guid householdId,
        BudgetScope scope,
        Guid? ownerUserId,
        CancellationToken cancellationToken);

    Task<string?> GetHouseholdCurrencyAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<BudgetCategoryRecord>> ListExpenseCategoriesAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<BudgetActualsRecord> GetActualsAsync(
        Guid householdId,
        Guid userId,
        int year,
        int month,
        BudgetScope scope,
        string currency,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<BudgetHistoricalActualRecord>> GetHistoricalActualsAsync(
        Guid householdId,
        Guid userId,
        DateOnly fromDate,
        DateOnly toDate,
        BudgetScope scope,
        string currency,
        CancellationToken cancellationToken);

    Task AddAsync(BudgetMonth budgetMonth, CancellationToken cancellationToken);

    Task AddLineAsync(BudgetLine budgetLine, CancellationToken cancellationToken);

    void Remove(BudgetMonth budgetMonth);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
