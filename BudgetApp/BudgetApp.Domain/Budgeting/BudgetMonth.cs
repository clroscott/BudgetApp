namespace BudgetApp.Domain.Budgeting;

public sealed class BudgetMonth
{
    public const int CurrencyCodeLength = 3;
    public const int MinimumYear = 1;
    public const int MaximumYear = 9999;

    private readonly List<BudgetLine> _lines = [];

    private BudgetMonth()
    {
    }

    private BudgetMonth(
        Guid id,
        Guid householdId,
        int year,
        int month,
        BudgetScope scope,
        Guid? ownerUserId,
        string currency,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = ValidateRequiredId(
            householdId,
            nameof(householdId),
            "Household ID");
        Year = ValidateYear(year);
        Month = ValidateMonth(month);
        SetScope(scope, ownerUserId);
        Currency = ValidateCurrency(currency);
        Status = BudgetStatus.Draft;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public int Year { get; private set; }

    public int Month { get; private set; }

    public BudgetScope Scope { get; private set; }

    public Guid? OwnerUserId { get; private set; }

    public string Currency { get; private set; } = string.Empty;

    public BudgetStatus Status { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public IReadOnlyCollection<BudgetLine> Lines => _lines;

    public static BudgetMonth CreateHousehold(
        Guid householdId,
        int year,
        int month,
        string currency,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            year,
            month,
            BudgetScope.Household,
            ownerUserId: null,
            currency,
            createdAtUtc);

    public static BudgetMonth CreatePersonal(
        Guid householdId,
        Guid ownerUserId,
        int year,
        int month,
        string currency,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            year,
            month,
            BudgetScope.Personal,
            ownerUserId,
            currency,
            createdAtUtc);

    public BudgetLine AddLine(
        Guid categoryId,
        decimal budgetedAmount,
        DateTimeOffset createdAtUtc)
    {
        EnsureEditable();
        if (_lines.Any(line => line.CategoryId == categoryId))
        {
            throw new InvalidOperationException(
                "A category can appear only once in a budget month.");
        }

        var line = BudgetLine.Create(Id, categoryId, budgetedAmount, createdAtUtc);
        _lines.Add(line);
        UpdatedAtUtc = createdAtUtc;
        return line;
    }

    public void UpdateLineAmount(
        Guid categoryId,
        decimal budgetedAmount,
        DateTimeOffset updatedAtUtc)
    {
        EnsureEditable();
        var line = FindLine(categoryId);
        line.UpdateAmount(budgetedAmount, updatedAtUtc);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void RemoveLine(Guid categoryId, DateTimeOffset updatedAtUtc)
    {
        EnsureEditable();
        var line = FindLine(categoryId);
        _lines.Remove(line);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Activate(DateTimeOffset updatedAtUtc)
    {
        if (Status != BudgetStatus.Draft)
        {
            throw new InvalidOperationException("Only a draft budget can be activated.");
        }

        Status = BudgetStatus.Active;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Close(DateTimeOffset updatedAtUtc)
    {
        if (Status != BudgetStatus.Active)
        {
            throw new InvalidOperationException("Only an active budget can be closed.");
        }

        Status = BudgetStatus.Closed;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Reopen(DateTimeOffset updatedAtUtc)
    {
        if (Status != BudgetStatus.Closed)
        {
            throw new InvalidOperationException("Only a closed budget can be reopened.");
        }

        Status = BudgetStatus.Active;
        UpdatedAtUtc = updatedAtUtc;
    }

    private BudgetLine FindLine(Guid categoryId) =>
        _lines.SingleOrDefault(line => line.CategoryId == categoryId)
        ?? throw new InvalidOperationException(
            "The category does not have a line in this budget month.");

    private void EnsureEditable()
    {
        if (Status == BudgetStatus.Closed)
        {
            throw new InvalidOperationException("A closed budget cannot be changed.");
        }
    }

    private void SetScope(BudgetScope scope, Guid? ownerUserId)
    {
        if (!Enum.IsDefined(scope))
        {
            throw new ArgumentOutOfRangeException(nameof(scope), "Budget scope is not supported.");
        }

        if (scope == BudgetScope.Personal &&
            (!ownerUserId.HasValue || ownerUserId.Value == Guid.Empty))
        {
            throw new ArgumentException(
                "Owner user ID is required for a personal budget.",
                nameof(ownerUserId));
        }

        if (scope == BudgetScope.Household && ownerUserId.HasValue)
        {
            throw new ArgumentException(
                "A household budget cannot have a personal owner.",
                nameof(ownerUserId));
        }

        Scope = scope;
        OwnerUserId = ownerUserId;
    }

    private static int ValidateYear(int year)
    {
        if (year is < MinimumYear or > MaximumYear)
        {
            throw new ArgumentOutOfRangeException(
                nameof(year),
                $"Budget year must be between {MinimumYear} and {MaximumYear}.");
        }

        return year;
    }

    private static int ValidateMonth(int month)
    {
        if (month is < 1 or > 12)
        {
            throw new ArgumentOutOfRangeException(
                nameof(month),
                "Budget month must be between 1 and 12.");
        }

        return month;
    }

    private static string ValidateCurrency(string currency)
    {
        if (string.IsNullOrWhiteSpace(currency))
        {
            throw new ArgumentException("Currency is required.", nameof(currency));
        }

        var normalizedCurrency = currency.Trim().ToUpperInvariant();
        if (normalizedCurrency.Length != CurrencyCodeLength ||
            normalizedCurrency.Any(character => !char.IsAsciiLetter(character)))
        {
            throw new ArgumentException(
                "Currency must be a three-letter ISO currency code.",
                nameof(currency));
        }

        return normalizedCurrency;
    }

    private static Guid ValidateRequiredId(
        Guid value,
        string parameterName,
        string displayName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException($"{displayName} is required.", parameterName);
        }

        return value;
    }
}
