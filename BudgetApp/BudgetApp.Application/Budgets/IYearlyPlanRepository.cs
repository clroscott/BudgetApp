using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Budgets;

public interface IYearlyPlanRepository
{
    Task<YearlyPlan?> GetAsync(
        Guid householdId,
        int fiscalYearStartYear,
        BudgetScope scope,
        Guid? ownerUserId,
        bool forUpdate,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<YearlyPlan>> ListCalendarYearCandidatesAsync(
        Guid householdId,
        int calendarYear,
        BudgetScope scope,
        Guid? ownerUserId,
        CancellationToken cancellationToken);

    Task<YearlyPlanDefaults?> GetDefaultsAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task<Household?> GetHouseholdForUpdateAsync(
        Guid householdId,
        CancellationToken cancellationToken);

    Task AddAsync(YearlyPlan plan, CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
