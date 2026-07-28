namespace BudgetApp.Domain.RecurringExpenses;

public sealed class RecurringExpense
{
    public const int NameMaxLength = 100;
    public const int CurrencyCodeLength = 3;
    public const decimal MaximumAmount = 999_999_999_999_999.9999m;

    private RecurringExpense()
    {
    }

    private RecurringExpense(
        Guid id,
        Guid householdId,
        RecurringExpenseScope scope,
        Guid? ownerUserId,
        string name,
        decimal amount,
        string currency,
        Guid categoryId,
        RecurringExpenseBudgetMode budgetMode,
        Guid? accountId,
        int? expectedDayOfMonth,
        DateOnly startsOn,
        DateOnly? endsOn,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = ValidateRequiredId(householdId, nameof(householdId), "Household ID");
        SetScope(scope, ownerUserId);
        SetDetails(name, amount, currency, categoryId, budgetMode, accountId);
        SetSchedule(expectedDayOfMonth, startsOn, endsOn);
        IsActive = true;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public RecurringExpenseScope Scope { get; private set; }

    public Guid? OwnerUserId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public decimal Amount { get; private set; }

    public string Currency { get; private set; } = string.Empty;

    public Guid CategoryId { get; private set; }

    public RecurringExpenseBudgetMode BudgetMode { get; private set; }

    public Guid? AccountId { get; private set; }

    public int? ExpectedDayOfMonth { get; private set; }

    public DateOnly StartsOn { get; private set; }

    public DateOnly? EndsOn { get; private set; }

    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static RecurringExpense CreateHousehold(
        Guid householdId,
        string name,
        decimal amount,
        string currency,
        Guid categoryId,
        Guid? accountId,
        int? expectedDayOfMonth,
        DateOnly startsOn,
        DateOnly? endsOn,
        DateTimeOffset createdAtUtc,
        RecurringExpenseBudgetMode budgetMode = RecurringExpenseBudgetMode.Detailed) =>
        new(
            Guid.NewGuid(), householdId, RecurringExpenseScope.Household,
            ownerUserId: null, name, amount, currency, categoryId, budgetMode, accountId,
            expectedDayOfMonth, startsOn, endsOn, createdAtUtc);

    public static RecurringExpense CreatePersonal(
        Guid householdId,
        Guid ownerUserId,
        string name,
        decimal amount,
        string currency,
        Guid categoryId,
        Guid? accountId,
        int? expectedDayOfMonth,
        DateOnly startsOn,
        DateOnly? endsOn,
        DateTimeOffset createdAtUtc,
        RecurringExpenseBudgetMode budgetMode = RecurringExpenseBudgetMode.Detailed) =>
        new(
            Guid.NewGuid(), householdId, RecurringExpenseScope.Personal,
            ownerUserId, name, amount, currency, categoryId, budgetMode, accountId,
            expectedDayOfMonth, startsOn, endsOn, createdAtUtc);

    public void Update(
        RecurringExpenseScope scope,
        Guid? ownerUserId,
        string name,
        decimal amount,
        string currency,
        Guid categoryId,
        RecurringExpenseBudgetMode budgetMode,
        Guid? accountId,
        int? expectedDayOfMonth,
        DateOnly startsOn,
        DateOnly? endsOn,
        DateTimeOffset updatedAtUtc)
    {
        SetScope(scope, ownerUserId);
        SetDetails(name, amount, currency, categoryId, budgetMode, accountId);
        SetSchedule(expectedDayOfMonth, startsOn, endsOn);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Deactivate(DateTimeOffset updatedAtUtc)
    {
        IsActive = false;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Reactivate(DateTimeOffset updatedAtUtc)
    {
        IsActive = true;
        UpdatedAtUtc = updatedAtUtc;
    }

    public bool AppliesTo(int year, int month)
    {
        if (year is < 1 or > 9999 || month is < 1 or > 12)
        {
            throw new ArgumentOutOfRangeException(nameof(year), "Enter a valid year and month.");
        }

        if (!IsActive)
        {
            return false;
        }

        var firstDay = new DateOnly(year, month, 1);
        var lastDay = new DateOnly(year, month, DateTime.DaysInMonth(year, month));
        return StartsOn <= lastDay && (!EndsOn.HasValue || EndsOn.Value >= firstDay);
    }

    public DateOnly? GetExpectedDate(int year, int month)
    {
        if (!ExpectedDayOfMonth.HasValue || !AppliesTo(year, month))
        {
            return null;
        }

        var day = Math.Min(ExpectedDayOfMonth.Value, DateTime.DaysInMonth(year, month));
        var expectedDate = new DateOnly(year, month, day);
        return expectedDate < StartsOn || (EndsOn.HasValue && expectedDate > EndsOn.Value)
            ? null
            : expectedDate;
    }

    private void SetScope(RecurringExpenseScope scope, Guid? ownerUserId)
    {
        if (!Enum.IsDefined(scope))
        {
            throw new ArgumentOutOfRangeException(nameof(scope), "Recurring expense scope is not supported.");
        }

        if (scope == RecurringExpenseScope.Personal &&
            (!ownerUserId.HasValue || ownerUserId.Value == Guid.Empty))
        {
            throw new ArgumentException(
                "Owner user ID is required for a personal recurring expense.",
                nameof(ownerUserId));
        }

        if (scope == RecurringExpenseScope.Household && ownerUserId.HasValue)
        {
            throw new ArgumentException(
                "A household recurring expense cannot have a personal owner.",
                nameof(ownerUserId));
        }

        Scope = scope;
        OwnerUserId = ownerUserId;
    }

    private void SetDetails(
        string name,
        decimal amount,
        string currency,
        Guid categoryId,
        RecurringExpenseBudgetMode budgetMode,
        Guid? accountId)
    {
        Name = ValidateName(name);
        Amount = ValidateAmount(amount);
        Currency = ValidateCurrency(currency);
        CategoryId = ValidateRequiredId(categoryId, nameof(categoryId), "Category ID");
        if (!Enum.IsDefined(budgetMode))
        {
            throw new ArgumentOutOfRangeException(
                nameof(budgetMode), "Recurring expense budget mode is not supported.");
        }
        BudgetMode = budgetMode;
        if (accountId == Guid.Empty)
        {
            throw new ArgumentException("Account ID cannot be empty.", nameof(accountId));
        }

        AccountId = accountId;
    }

    private void SetSchedule(int? expectedDayOfMonth, DateOnly startsOn, DateOnly? endsOn)
    {
        if (expectedDayOfMonth is < 1 or > 31)
        {
            throw new ArgumentOutOfRangeException(
                nameof(expectedDayOfMonth),
                "Expected day of month must be between 1 and 31.");
        }

        if (endsOn.HasValue && endsOn.Value < startsOn)
        {
            throw new ArgumentException("End date cannot be before start date.", nameof(endsOn));
        }

        ExpectedDayOfMonth = expectedDayOfMonth;
        StartsOn = startsOn;
        EndsOn = endsOn;
    }

    private static string ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Recurring expense name is required.", nameof(name));
        }

        var trimmed = name.Trim();
        if (trimmed.Length > NameMaxLength)
        {
            throw new ArgumentException(
                $"Recurring expense name cannot exceed {NameMaxLength} characters.", nameof(name));
        }

        return trimmed;
    }

    private static decimal ValidateAmount(decimal amount)
    {
        if (amount <= 0 || amount > MaximumAmount)
        {
            throw new ArgumentOutOfRangeException(
                nameof(amount), $"Recurring expense amount must be greater than 0 and no more than {MaximumAmount}.");
        }

        if (decimal.Round(amount, 4) != amount)
        {
            throw new ArgumentException(
                "Recurring expense amount cannot contain more than four decimal places.", nameof(amount));
        }

        return amount;
    }

    private static string ValidateCurrency(string currency)
    {
        if (string.IsNullOrWhiteSpace(currency))
        {
            throw new ArgumentException("Currency is required.", nameof(currency));
        }

        var normalized = currency.Trim().ToUpperInvariant();
        if (normalized.Length != CurrencyCodeLength ||
            normalized.Any(character => !char.IsAsciiLetter(character)))
        {
            throw new ArgumentException(
                "Currency must be a three-letter ISO currency code.", nameof(currency));
        }

        return normalized;
    }

    private static Guid ValidateRequiredId(Guid value, string parameterName, string displayName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException($"{displayName} is required.", parameterName);
        }

        return value;
    }
}
