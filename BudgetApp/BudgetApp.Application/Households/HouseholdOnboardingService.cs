using BudgetApp.Application.Categories;
using BudgetApp.Application.Finance;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed class HouseholdOnboardingService(
    IHouseholdRepository householdRepository,
    TimeProvider timeProvider)
{
    public Task<IReadOnlyList<HouseholdMembership>> GetActiveMembershipsAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("User ID is required.", nameof(userId));
        }

        return householdRepository.GetActiveMembershipsAsync(
            userId,
            cancellationToken);
    }

    public async Task<HouseholdMembership> CreateInitialHouseholdAsync(
        Guid userId,
        string name,
        string defaultCurrency,
        string timeZoneId,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("User ID is required.", nameof(userId));
        }

        if (await householdRepository.HasActiveMembershipAsync(
                userId,
                cancellationToken))
        {
            throw new HouseholdMembershipExistsException();
        }

        var normalizedCurrency = CurrencyCatalog.NormalizeSupported(defaultCurrency);

        var normalizedTimeZoneId = timeZoneId.Trim();
        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(normalizedTimeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            throw new UnsupportedTimeZoneException(normalizedTimeZoneId);
        }
        catch (InvalidTimeZoneException)
        {
            throw new UnsupportedTimeZoneException(normalizedTimeZoneId);
        }

        var createdAtUtc = timeProvider.GetUtcNow();
        var household = Household.Create(
            name,
            normalizedCurrency,
            normalizedTimeZoneId,
            userId,
            createdAtUtc);
        var initialCategories = DefaultCategoryCatalog.CreateForHousehold(
            household.Id,
            createdAtUtc);

        await householdRepository.AddAsync(
            household,
            initialCategories,
            cancellationToken);

        return new HouseholdMembership(
            household.Id,
            household.Name,
            household.DefaultCurrency,
            household.TimeZoneId,
            HouseholdRole.Owner);
    }
}
