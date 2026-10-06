using BudgetApp.Application.Auditing;
using BudgetApp.Application.Finance;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed class HouseholdSettingsService(IHouseholdSettingsRepository repository,
    HouseholdAuthorizationService authorization, AuditWriter auditWriter, TimeProvider timeProvider)
{
    public async Task<HouseholdSettingsModel> GetAsync(Guid householdId, Guid userId, CancellationToken cancellationToken)
    {
        var role = await authorization.RequireViewAsync(householdId, userId, cancellationToken);
        var snapshot = await repository.GetAsync(householdId, cancellationToken)
            ?? throw new HouseholdAccessDeniedException();
        return ToModel(snapshot, role is HouseholdRole.Owner or HouseholdRole.Admin);
    }

    public async Task<HouseholdSettingsModel> SaveAsync(Guid householdId, Guid userId, string name,
        string defaultCurrency, string timeZoneId, int fiscalYearStartMonth, DateTimeOffset version,
        CancellationToken cancellationToken)
    {
        await authorization.RequireManageAsync(householdId, userId, cancellationToken);
        var currency = CurrencyCatalog.NormalizeSupported(defaultCurrency);
        var zone = timeZoneId.Trim();
        try { _ = TimeZoneInfo.FindSystemTimeZoneById(zone); }
        catch (TimeZoneNotFoundException) { throw new UnsupportedTimeZoneException(zone); }
        catch (InvalidTimeZoneException) { throw new UnsupportedTimeZoneException(zone); }

        var saved = await repository.UpdateAsync(householdId, version, async (household, locked) =>
        {
            // Recheck membership inside the same transaction as the write.
            await authorization.RequireManageAsync(householdId, userId, cancellationToken);
            if (currency != household.DefaultCurrency && locked) throw new HouseholdCurrencyLockedException();
            Apply(household, userId, name, currency, zone, fiscalYearStartMonth);
        }, cancellationToken);
        return ToModel(saved, true);
    }

    // Compatibility endpoint: changes only this field, using the same manager-only workflow.
    public async Task<int> ChangeDefaultStartMonthAsync(Guid householdId, Guid userId, int startMonth,
        CancellationToken cancellationToken)
    {
        await authorization.RequireManageAsync(householdId, userId, cancellationToken);
        var saved = await repository.UpdateAsync(householdId, null, async (household, _) =>
        {
            await authorization.RequireManageAsync(householdId, userId, cancellationToken);
            Apply(household, userId, household.Name, household.DefaultCurrency, household.TimeZoneId, startMonth);
        }, cancellationToken);
        return saved.Household.FiscalYearStartMonth;
    }

    private void Apply(Household household, Guid userId, string name, string currency, string zone, int month)
    {
        var before = new[] { household.Name, household.DefaultCurrency, household.TimeZoneId, household.FiscalYearStartMonth.ToString() };
        var now = timeProvider.GetUtcNow();
        // Retrying with a frozen clock must still advance the conflict token.
        if (now <= household.UpdatedAtUtc) now = household.UpdatedAtUtc.AddTicks(1);
        household.UpdateSettings(name, currency, zone, month, now);
        var after = new[] { household.Name, household.DefaultCurrency, household.TimeZoneId, household.FiscalYearStartMonth.ToString() };
        var labels = new[] { "Name", "Default currency", "Time zone", "Fiscal year start month" };
        var details = new Dictionary<string, string?>();
        for (var index = 0; index < labels.Length; index++)
            if (before[index] != after[index]) details[labels[index]] = $"{before[index]} → {after[index]}";
        if (details.Count == 0) return;
        auditWriter.Record(new AuditEventInput(household.Id, userId, AuditVisibility.Household, null,
            AuditActions.Updated, AuditEntityTypes.Household, household.Id, "Updated household settings.", details));
    }

    private static HouseholdSettingsModel ToModel(HouseholdSettingsSnapshot snapshot, bool canEdit) => new(
        snapshot.Household.Id, snapshot.Household.Name, snapshot.Household.DefaultCurrency,
        snapshot.Household.TimeZoneId, snapshot.Household.FiscalYearStartMonth, snapshot.Household.UpdatedAtUtc,
        canEdit, !snapshot.HasFinancialData, snapshot.HasFinancialData ? new HouseholdCurrencyLockedException().Message : null);
}
