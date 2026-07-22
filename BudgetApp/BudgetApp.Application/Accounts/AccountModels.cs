namespace BudgetApp.Application.Accounts;

public sealed record AccountListItem(
    Guid Id,
    string Name,
    string Type,
    string Scope,
    Guid? OwnerUserId,
    string Currency,
    string? InstitutionName,
    string? LastFourDigits,
    bool IsActive);
