using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed record HouseholdMembership(
    Guid HouseholdId,
    string Name,
    string DefaultCurrency,
    string TimeZoneId,
    HouseholdRole Role);
