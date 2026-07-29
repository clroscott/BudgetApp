namespace BudgetApp.Application.CategorizationRules;

public sealed record CategorizationRuleItem(
    Guid Id,
    string Name,
    string MatchField,
    string MatchOperator,
    string MatchValue,
    Guid? AccountId,
    Guid TargetCategoryId,
    int Priority,
    bool IsActive);
