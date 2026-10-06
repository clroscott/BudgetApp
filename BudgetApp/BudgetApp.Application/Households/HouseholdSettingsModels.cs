using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed record HouseholdSettingsModel(Guid Id, string Name, string DefaultCurrency,
    string TimeZoneId, int FiscalYearStartMonth, DateTimeOffset Version,
    bool CanEdit, bool CanChangeCurrency, string? CurrencyLockedReason);

public sealed record HouseholdSettingsSnapshot(Household Household, bool HasFinancialData);

public sealed class HouseholdSettingsConflictException() : InvalidOperationException(
    "These household settings changed elsewhere. Reload the settings before saving again.");

public sealed class HouseholdCurrencyLockedException() : InvalidOperationException(
    "The default currency cannot change after financial accounts, imports, budgets, annual plans, transactions, or recurring expenses exist.");
