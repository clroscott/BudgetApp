using BudgetApp.Application.Accounts;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.CategorizationRules;

namespace BudgetApp.Application.CategorizationRules;

public sealed class CategorizationRuleManagementService(
    ICategorizationRuleRepository ruleRepository,
    ICategoryRepository categoryRepository,
    IAccountRepository accountRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider,
    AuditWriter? auditWriter = null)
{
    public async Task<IReadOnlyList<CategorizationRuleItem>> ListAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);

        return (await ruleRepository.ListAsync(
                householdId,
                forUpdate: false,
                cancellationToken))
            .OrderBy(rule => rule.Priority)
            .ThenBy(rule => rule.Name)
            .Select(ToItem)
            .ToList();
    }

    public async Task<Guid> CreateAsync(
        Guid householdId,
        Guid userId,
        string name,
        string matchField,
        string matchOperator,
        string matchValue,
        Guid? accountId,
        Guid targetCategoryId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        var parsedField = ParseField(matchField);
        var parsedOperator = ParseOperator(matchOperator);
        await ValidateDefinition(
            householdId,
            name,
            accountId,
            targetCategoryId,
            excludedRuleId: null,
            cancellationToken);

        var rules = await ruleRepository.ListAsync(
            householdId,
            forUpdate: false,
            cancellationToken);
        var rule = CategorizationRule.Create(
            householdId,
            name,
            parsedField,
            parsedOperator,
            matchValue,
            accountId,
            targetCategoryId,
            rules.Count,
            timeProvider.GetUtcNow());

        await ruleRepository.AddAsync(rule, cancellationToken);
        RecordRuleEvent(
            rule,
            userId,
            AuditActions.Created,
            $"Created categorization rule '{rule.Name}'.");
        await ruleRepository.SaveChangesAsync(cancellationToken);
        return rule.Id;
    }

    public async Task UpdateAsync(
        Guid householdId,
        Guid userId,
        Guid ruleId,
        string name,
        string matchField,
        string matchOperator,
        string matchValue,
        Guid? accountId,
        Guid targetCategoryId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        var rule = await GetRule(householdId, ruleId, cancellationToken);
        var previousName = rule.Name;
        await ValidateDefinition(
            householdId,
            name,
            accountId,
            targetCategoryId,
            rule.Id,
            cancellationToken);

        rule.Update(
            name,
            ParseField(matchField),
            ParseOperator(matchOperator),
            matchValue,
            accountId,
            targetCategoryId,
            timeProvider.GetUtcNow());
        RecordRuleEvent(
            rule,
            userId,
            AuditActions.Updated,
            $"Updated categorization rule '{rule.Name}'.",
            new Dictionary<string, string?>
            {
                ["Name"] = $"{previousName} → {rule.Name}",
                ["Match"] = $"{rule.MatchField} {rule.MatchOperator} {rule.MatchValue}"
            });
        await ruleRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task SetActiveAsync(
        Guid householdId,
        Guid userId,
        Guid ruleId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        var rule = await GetRule(householdId, ruleId, cancellationToken);

        if (isActive)
        {
            await ValidateDefinition(
                householdId,
                rule.Name,
                rule.AccountId,
                rule.TargetCategoryId,
                rule.Id,
                cancellationToken);
            rule.Reactivate(timeProvider.GetUtcNow());
        }
        else
        {
            rule.Deactivate(timeProvider.GetUtcNow());
        }

        RecordRuleEvent(
            rule,
            userId,
            isActive ? AuditActions.Activated : AuditActions.Deactivated,
            $"{(isActive ? "Activated" : "Deactivated")} categorization rule " +
            $"'{rule.Name}'.");
        await ruleRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task ReorderAsync(
        Guid householdId,
        Guid userId,
        IReadOnlyList<Guid> orderedRuleIds,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        if (orderedRuleIds.Count == 0 ||
            orderedRuleIds.Distinct().Count() != orderedRuleIds.Count)
        {
            throw new ArgumentException(
                "Rule order must contain unique rule IDs.",
                nameof(orderedRuleIds));
        }

        var rules = await ruleRepository.ListAsync(
            householdId,
            forUpdate: true,
            cancellationToken);
        if (rules.Count != orderedRuleIds.Count ||
            !rules.Select(rule => rule.Id).ToHashSet().SetEquals(orderedRuleIds))
        {
            throw new ArgumentException(
                "Rule order must include every categorization rule.",
                nameof(orderedRuleIds));
        }

        var byId = rules.ToDictionary(rule => rule.Id);
        var now = timeProvider.GetUtcNow();
        for (var index = 0; index < orderedRuleIds.Count; index++)
        {
            byId[orderedRuleIds[index]].SetPriority(index, now);
        }

        auditWriter?.Record(new AuditEventInput(
            householdId,
            userId,
            AuditVisibility.Household,
            null,
            AuditActions.Updated,
            AuditEntityTypes.CategorizationRule,
            orderedRuleIds[0],
            "Reordered categorization rules.",
            new Dictionary<string, string?>
            {
                ["Rules reordered"] = orderedRuleIds.Count.ToString()
            }));
        await ruleRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(
        Guid householdId,
        Guid userId,
        Guid ruleId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(
            householdId,
            userId,
            cancellationToken);
        var rule = await GetRule(householdId, ruleId, cancellationToken);
        RecordRuleEvent(
            rule,
            userId,
            AuditActions.Deleted,
            $"Deleted categorization rule '{rule.Name}'.");
        ruleRepository.Remove(rule);

        var remainingRules = await ruleRepository.ListAsync(
            householdId,
            forUpdate: true,
            cancellationToken);
        var now = timeProvider.GetUtcNow();
        foreach (var (remainingRule, index) in remainingRules
                     .Where(candidate => candidate.Id != rule.Id)
                     .OrderBy(candidate => candidate.Priority)
                     .Select((candidate, index) => (candidate, index)))
        {
            remainingRule.SetPriority(index, now);
        }

        await ruleRepository.SaveChangesAsync(cancellationToken);
    }

    private void RecordRuleEvent(
        CategorizationRule rule,
        Guid actorUserId,
        string action,
        string summary,
        IReadOnlyDictionary<string, string?>? details = null)
    {
        auditWriter?.Record(new AuditEventInput(
            rule.HouseholdId,
            actorUserId,
            AuditVisibility.Household,
            null,
            action,
            AuditEntityTypes.CategorizationRule,
            rule.Id,
            summary,
            details));
    }

    private async Task ValidateDefinition(
        Guid householdId,
        string name,
        Guid? accountId,
        Guid targetCategoryId,
        Guid? excludedRuleId,
        CancellationToken cancellationToken)
    {
        var normalizedName = name.Trim().ToUpperInvariant();
        if (await ruleRepository.NameExistsAsync(
                householdId,
                normalizedName,
                excludedRuleId,
                cancellationToken))
        {
            throw new CategorizationRuleConflictException(
                $"A categorization rule named '{name.Trim()}' already exists.");
        }

        var category = await categoryRepository.GetForUpdateAsync(
            householdId,
            targetCategoryId,
            cancellationToken) ?? throw new CategoryNotFoundException();
        if (!category.IsActive)
        {
            throw new InvalidOperationException(
                "A categorization rule must target an active category.");
        }

        if (accountId.HasValue)
        {
            var account = await accountRepository.GetForUpdateAsync(
                householdId,
                accountId.Value,
                cancellationToken) ?? throw new AccountNotFoundException();
            if (!account.IsActive)
            {
                throw new InvalidOperationException(
                    "A categorization rule cannot be restricted to an archived account.");
            }

            if (account.Scope != AccountScope.Household)
            {
                throw new InvalidOperationException(
                    "Account-specific household rules can only target household accounts.");
            }
        }
    }

    private async Task<CategorizationRule> GetRule(
        Guid householdId,
        Guid ruleId,
        CancellationToken cancellationToken) =>
        await ruleRepository.GetForUpdateAsync(
            householdId,
            ruleId,
            cancellationToken) ?? throw new CategorizationRuleNotFoundException();

    private static CategorizationRuleMatchField ParseField(string value)
    {
        if (!Enum.TryParse<CategorizationRuleMatchField>(
                value,
                ignoreCase: true,
                out var result) ||
            !Enum.IsDefined(result))
        {
            throw new ArgumentException(
                "Categorization rule match field is not supported.",
                nameof(value));
        }

        return result;
    }

    private static CategorizationRuleMatchOperator ParseOperator(string value)
    {
        if (!Enum.TryParse<CategorizationRuleMatchOperator>(
                value,
                ignoreCase: true,
                out var result) ||
            !Enum.IsDefined(result))
        {
            throw new ArgumentException(
                "Categorization rule match operator is not supported.",
                nameof(value));
        }

        return result;
    }

    private static CategorizationRuleItem ToItem(CategorizationRule rule) =>
        new(
            rule.Id,
            rule.Name,
            rule.MatchField.ToString(),
            rule.MatchOperator.ToString(),
            rule.MatchValue,
            rule.AccountId,
            rule.TargetCategoryId,
            rule.Priority,
            rule.IsActive);
}
