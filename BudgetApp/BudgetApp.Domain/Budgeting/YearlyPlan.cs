namespace BudgetApp.Domain.Budgeting;

public sealed class YearlyPlan
{
    private readonly List<YearlyTargetLine> _lines = [];

    private YearlyPlan()
    {
    }

    private YearlyPlan(
        Guid householdId,
        int fiscalYearStartYear,
        int fiscalYearStartMonth,
        BudgetScope scope,
        Guid? ownerUserId,
        string currency,
        DateTimeOffset createdAtUtc)
    {
        if (householdId == Guid.Empty)
            throw new ArgumentException("Household ID is required.", nameof(householdId));
        if (fiscalYearStartYear is < BudgetMonth.MinimumYear or > BudgetMonth.MaximumYear)
            throw new ArgumentOutOfRangeException(nameof(fiscalYearStartYear));
        if (fiscalYearStartMonth is < 1 or > 12)
            throw new ArgumentOutOfRangeException(nameof(fiscalYearStartMonth));
        if (fiscalYearStartYear == BudgetMonth.MaximumYear)
            throw new ArgumentOutOfRangeException(
                nameof(fiscalYearStartYear),
                "This fiscal year would exceed the supported calendar range.");
        if (!Enum.IsDefined(scope))
            throw new ArgumentOutOfRangeException(nameof(scope));
        if (scope == BudgetScope.Personal && (!ownerUserId.HasValue || ownerUserId == Guid.Empty))
            throw new ArgumentException("Owner user ID is required for a personal plan.", nameof(ownerUserId));
        if (scope == BudgetScope.Household && ownerUserId.HasValue)
            throw new ArgumentException("A household plan cannot have a personal owner.", nameof(ownerUserId));

        Id = Guid.NewGuid();
        HouseholdId = householdId;
        FiscalYearStartYear = fiscalYearStartYear;
        FiscalYearStartMonth = fiscalYearStartMonth;
        Scope = scope;
        OwnerUserId = ownerUserId;
        Currency = ValidateCurrency(currency);
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public int FiscalYearStartYear { get; private set; }
    public int FiscalYearStartMonth { get; private set; }
    public BudgetScope Scope { get; private set; }
    public Guid? OwnerUserId { get; private set; }
    public string Currency { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public IReadOnlyCollection<YearlyTargetLine> Lines => _lines;

    public static YearlyPlan CreateHousehold(
        Guid householdId, int startYear, int startMonth, string currency, DateTimeOffset now) =>
        new(householdId, startYear, startMonth, BudgetScope.Household, null, currency, now);

    public static YearlyPlan CreatePersonal(
        Guid householdId, Guid ownerUserId, int startYear, int startMonth,
        string currency, DateTimeOffset now) =>
        new(householdId, startYear, startMonth, BudgetScope.Personal, ownerUserId, currency, now);

    public YearlyTargetLine AddLine(
        Guid categoryId, decimal annualTargetAmount, DateTimeOffset now)
    {
        if (_lines.Any(line => line.CategoryId == categoryId))
            throw new InvalidOperationException("A category can appear only once in a yearly plan.");
        var line = YearlyTargetLine.Create(Id, categoryId, annualTargetAmount, now);
        _lines.Add(line);
        UpdatedAtUtc = now;
        return line;
    }

    public void ReplaceLines(
        IReadOnlyList<(Guid CategoryId, decimal AnnualTargetAmount)> lines,
        DateTimeOffset now)
    {
        if (lines.Select(line => line.CategoryId).Distinct().Count() != lines.Count)
            throw new InvalidOperationException("A category can appear only once in a yearly plan.");

        var requested = lines.ToDictionary(line => line.CategoryId, line => line.AnnualTargetAmount);
        foreach (var existing in _lines.ToList())
        {
            if (requested.Remove(existing.CategoryId, out var amount))
                existing.UpdateAmount(amount, now);
            else
                _lines.Remove(existing);
        }

        foreach (var line in requested)
            _lines.Add(YearlyTargetLine.Create(Id, line.Key, line.Value, now));
        UpdatedAtUtc = now;
    }

    public void ChangeFiscalYearStartMonth(
        int fiscalYearStartMonth,
        DateTimeOffset now)
    {
        if (fiscalYearStartMonth is < 1 or > 12)
            throw new ArgumentOutOfRangeException(nameof(fiscalYearStartMonth));

        FiscalYearStartMonth = fiscalYearStartMonth;
        UpdatedAtUtc = now;
    }

    private static string ValidateCurrency(string currency)
    {
        if (string.IsNullOrWhiteSpace(currency))
            throw new ArgumentException("Currency is required.", nameof(currency));
        var normalized = currency.Trim().ToUpperInvariant();
        if (normalized.Length != BudgetMonth.CurrencyCodeLength ||
            normalized.Any(character => !char.IsAsciiLetter(character)))
            throw new ArgumentException(
                "Currency must be a three-letter ISO currency code.",
                nameof(currency));
        return normalized;
    }
}
