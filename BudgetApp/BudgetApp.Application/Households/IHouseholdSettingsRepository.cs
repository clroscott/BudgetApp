using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public interface IHouseholdSettingsRepository
{
    Task<HouseholdSettingsSnapshot?> GetAsync(Guid householdId, CancellationToken cancellationToken);
    // The financial-data check, callback, household update and audit save share a transaction.
    Task<HouseholdSettingsSnapshot> UpdateAsync(Guid householdId, DateTimeOffset? version,
        Func<Household, bool, Task> update, CancellationToken cancellationToken);
}
