namespace BudgetApp.Domain.Accounts;

public sealed class Account
{
    public const int NameMaxLength = 100;
    public const int InstitutionNameMaxLength = 100;
    public const int CurrencyCodeLength = 3;
    public const int LastFourDigitsLength = 4;

    private Account()
    {
    }

    private Account(
        Guid id,
        Guid householdId,
        string name,
        AccountType type,
        AccountScope scope,
        Guid? ownerUserId,
        string currency,
        string? institutionName,
        string? lastFourDigits,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = ValidateHouseholdId(householdId);
        SetDetails(name, type, institutionName, lastFourDigits);
        Scope = scope;
        OwnerUserId = ownerUserId;
        Currency = ValidateCurrency(currency);
        IsActive = true;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public AccountType Type { get; private set; }

    public AccountScope Scope { get; private set; }

    public Guid? OwnerUserId { get; private set; }

    public string Currency { get; private set; } = string.Empty;

    public string? InstitutionName { get; private set; }

    public string? LastFourDigits { get; private set; }

    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Account CreateHousehold(
        Guid householdId,
        string name,
        AccountType type,
        string currency,
        string? institutionName,
        string? lastFourDigits,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            name,
            type,
            AccountScope.Household,
            ownerUserId: null,
            currency,
            institutionName,
            lastFourDigits,
            createdAtUtc);

    public static Account CreatePersonal(
        Guid householdId,
        Guid ownerUserId,
        string name,
        AccountType type,
        string currency,
        string? institutionName,
        string? lastFourDigits,
        DateTimeOffset createdAtUtc)
    {
        if (ownerUserId == Guid.Empty)
        {
            throw new ArgumentException(
                "Owner user ID is required for a personal account.",
                nameof(ownerUserId));
        }

        return new Account(
            Guid.NewGuid(),
            householdId,
            name,
            type,
            AccountScope.Personal,
            ownerUserId,
            currency,
            institutionName,
            lastFourDigits,
            createdAtUtc);
    }

    public void UpdateDetails(
        string name,
        AccountType type,
        string? institutionName,
        string? lastFourDigits,
        DateTimeOffset updatedAtUtc)
    {
        SetDetails(name, type, institutionName, lastFourDigits);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Archive(DateTimeOffset updatedAtUtc)
    {
        IsActive = false;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Reactivate(DateTimeOffset updatedAtUtc)
    {
        IsActive = true;
        UpdatedAtUtc = updatedAtUtc;
    }

    private void SetDetails(
        string name,
        AccountType type,
        string? institutionName,
        string? lastFourDigits)
    {
        Name = ValidateRequiredText(
            name,
            NameMaxLength,
            nameof(name),
            "Account name");
        Type = ValidateType(type);
        InstitutionName = ValidateOptionalText(
            institutionName,
            InstitutionNameMaxLength,
            nameof(institutionName),
            "Institution name");
        LastFourDigits = ValidateLastFourDigits(lastFourDigits);
    }

    private static Guid ValidateHouseholdId(Guid householdId)
    {
        if (householdId == Guid.Empty)
        {
            throw new ArgumentException(
                "Household ID is required.",
                nameof(householdId));
        }

        return householdId;
    }

    private static AccountType ValidateType(AccountType type)
    {
        if (!Enum.IsDefined(type))
        {
            throw new ArgumentOutOfRangeException(
                nameof(type),
                "Account type is not supported.");
        }

        return type;
    }

    private static string ValidateCurrency(string currency)
    {
        var normalizedCurrency = ValidateRequiredText(
            currency,
            CurrencyCodeLength,
            nameof(currency),
            "Currency").ToUpperInvariant();

        if (normalizedCurrency.Length != CurrencyCodeLength ||
            normalizedCurrency.Any(character => !char.IsAsciiLetter(character)))
        {
            throw new ArgumentException(
                "Currency must be a three-letter ISO currency code.",
                nameof(currency));
        }

        return normalizedCurrency;
    }

    private static string? ValidateLastFourDigits(string? lastFourDigits)
    {
        var normalizedValue = ValidateOptionalText(
            lastFourDigits,
            LastFourDigitsLength,
            nameof(lastFourDigits),
            "Last four digits");
        if (normalizedValue is not null &&
            (normalizedValue.Length != LastFourDigitsLength ||
             normalizedValue.Any(character => !char.IsAsciiDigit(character))))
        {
            throw new ArgumentException(
                "Last four digits must contain exactly four digits.",
                nameof(lastFourDigits));
        }

        return normalizedValue;
    }

    private static string ValidateRequiredText(
        string value,
        int maxLength,
        string parameterName,
        string displayName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{displayName} is required.", parameterName);
        }

        var trimmedValue = value.Trim();
        if (trimmedValue.Length > maxLength)
        {
            throw new ArgumentException(
                $"{displayName} cannot exceed {maxLength} characters.",
                parameterName);
        }

        return trimmedValue;
    }

    private static string? ValidateOptionalText(
        string? value,
        int maxLength,
        string parameterName,
        string displayName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmedValue = value.Trim();
        if (trimmedValue.Length > maxLength)
        {
            throw new ArgumentException(
                $"{displayName} cannot exceed {maxLength} characters.",
                parameterName);
        }

        return trimmedValue;
    }
}
