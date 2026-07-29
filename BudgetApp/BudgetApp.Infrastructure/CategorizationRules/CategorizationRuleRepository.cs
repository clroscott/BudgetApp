using BudgetApp.Application.CategorizationRules;
using BudgetApp.Domain.CategorizationRules;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.CategorizationRules;

internal sealed class CategorizationRuleRepository(BudgetAppDbContext dbContext)
    : ICategorizationRuleRepository
{
    public async Task<IReadOnlyList<CategorizationRule>> ListAsync(
        Guid householdId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var query = dbContext.CategorizationRules
            .Where(rule => rule.HouseholdId == householdId);
        if (!forUpdate)
        {
            query = query.AsNoTracking();
        }

        return await query
            .OrderBy(rule => rule.Priority)
            .ThenBy(rule => rule.Name)
            .ToListAsync(cancellationToken);
    }

    public Task<CategorizationRule?> GetForUpdateAsync(
        Guid householdId,
        Guid ruleId,
        CancellationToken cancellationToken) =>
        dbContext.CategorizationRules.SingleOrDefaultAsync(
            rule => rule.HouseholdId == householdId && rule.Id == ruleId,
            cancellationToken);

    public Task<bool> NameExistsAsync(
        Guid householdId,
        string normalizedName,
        Guid? excludedRuleId,
        CancellationToken cancellationToken) =>
        dbContext.CategorizationRules.AnyAsync(
            rule =>
                rule.HouseholdId == householdId &&
                rule.NormalizedName == normalizedName &&
                rule.Id != excludedRuleId,
            cancellationToken);

    public async Task AddAsync(
        CategorizationRule rule,
        CancellationToken cancellationToken) =>
        await dbContext.CategorizationRules.AddAsync(rule, cancellationToken);

    public void Remove(CategorizationRule rule) =>
        dbContext.CategorizationRules.Remove(rule);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
