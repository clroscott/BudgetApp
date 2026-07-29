namespace BudgetApp.Application.CategorizationRules;

public sealed class CategorizationRuleConflictException(string message)
    : Exception(message);
