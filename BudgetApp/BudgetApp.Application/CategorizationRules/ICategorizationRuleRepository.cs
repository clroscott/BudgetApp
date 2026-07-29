using BudgetApp.Domain.CategorizationRules;

namespace BudgetApp.Application.CategorizationRules;

public interface ICategorizationRuleRepository
{
    Task<IReadOnlyList<CategorizationRule>> ListAsync(
        Guid householdId,
        bool forUpdate,
        CancellationToken cancellationToken);

    Task<CategorizationRule?> GetForUpdateAsync(
        Guid householdId,
        Guid ruleId,
        CancellationToken cancellationToken);

    Task<bool> NameExistsAsync(
        Guid householdId,
        string normalizedName,
        Guid? excludedRuleId,
        CancellationToken cancellationToken);

    Task AddAsync(
        CategorizationRule rule,
        CancellationToken cancellationToken);

    void Remove(CategorizationRule rule);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
