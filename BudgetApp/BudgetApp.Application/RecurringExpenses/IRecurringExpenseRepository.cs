using BudgetApp.Domain.RecurringExpenses;

namespace BudgetApp.Application.RecurringExpenses;

public interface IRecurringExpenseRepository
{
    Task<IReadOnlyList<RecurringExpenseRecord>> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken);

    Task<RecurringExpense?> GetForUpdateAsync(
        Guid householdId,
        Guid recurringExpenseId,
        CancellationToken cancellationToken);

    Task<string?> GetHouseholdCurrencyAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task AddAsync(RecurringExpense recurringExpense, CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
