using System.Globalization;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed class HouseholdOnboardingService(
    IHouseholdRepository householdRepository,
    TimeProvider timeProvider)
{
    private static readonly HashSet<string> SupportedCurrencyCodes =
        CultureInfo.GetCultures(CultureTypes.SpecificCultures)
            .Select(culture => new RegionInfo(culture.Name).ISOCurrencySymbol)
            .Where(code => code.Length == Household.CurrencyCodeLength)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

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

        var normalizedCurrency = defaultCurrency.Trim().ToUpperInvariant();
        if (!SupportedCurrencyCodes.Contains(normalizedCurrency))
        {
            throw new UnsupportedCurrencyException(normalizedCurrency);
        }

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

        var household = Household.Create(
            name,
            normalizedCurrency,
            normalizedTimeZoneId,
            userId,
            timeProvider.GetUtcNow());

        await householdRepository.AddAsync(household, cancellationToken);

        return new HouseholdMembership(
            household.Id,
            household.Name,
            household.DefaultCurrency,
            household.TimeZoneId,
            HouseholdRole.Owner);
    }
}
