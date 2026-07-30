namespace BudgetApp.Domain.Households;

public sealed class Household
{
    public const int NameMaxLength = 100;
    public const int CurrencyCodeLength = 3;
    public const int TimeZoneIdMaxLength = 100;

    private readonly List<HouseholdMember> _members = [];

    private Household()
    {
    }

    private Household(
        Guid id,
        string name,
        string defaultCurrency,
        string timeZoneId,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        Name = name;
        DefaultCurrency = defaultCurrency;
        TimeZoneId = timeZoneId;
        IsActive = true;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string DefaultCurrency { get; private set; } = string.Empty;

    public string TimeZoneId { get; private set; } = string.Empty;

    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public IReadOnlyCollection<HouseholdMember> Members => _members;

    public static Household Create(
        string name,
        string defaultCurrency,
        string timeZoneId,
        Guid ownerUserId,
        DateTimeOffset createdAtUtc)
    {
        var normalizedName = ValidateRequiredText(
            name,
            NameMaxLength,
            nameof(name),
            "Household name");
        var normalizedCurrency = ValidateCurrency(defaultCurrency);
        var normalizedTimeZoneId = ValidateRequiredText(
            timeZoneId,
            TimeZoneIdMaxLength,
            nameof(timeZoneId),
            "Time zone ID");

        if (ownerUserId == Guid.Empty)
        {
            throw new ArgumentException("Owner user ID is required.", nameof(ownerUserId));
        }

        var household = new Household(
            Guid.NewGuid(),
            normalizedName,
            normalizedCurrency,
            normalizedTimeZoneId,
            createdAtUtc);

        household._members.Add(
            HouseholdMember.CreateOwner(household.Id, ownerUserId, createdAtUtc));

        return household;
    }

    public HouseholdMember AddInvitedMember(
        Guid userId,
        HouseholdRole role,
        Guid invitedByUserId,
        DateTimeOffset joinedAtUtc)
    {
        if (_members.Any(member => member.UserId == userId))
        {
            throw new InvalidOperationException(
                "The user already belongs to this household.");
        }

        var member = HouseholdMember.CreateInvitedMember(
            Id,
            userId,
            role,
            invitedByUserId,
            joinedAtUtc);
        _members.Add(member);
        UpdatedAtUtc = joinedAtUtc;
        return member;
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

    private static string ValidateCurrency(string defaultCurrency)
    {
        var normalizedCurrency = ValidateRequiredText(
            defaultCurrency,
            CurrencyCodeLength,
            nameof(defaultCurrency),
            "Default currency").ToUpperInvariant();

        if (normalizedCurrency.Length != CurrencyCodeLength ||
            normalizedCurrency.Any(character => !char.IsAsciiLetter(character)))
        {
            throw new ArgumentException(
                "Default currency must be a three-letter ISO currency code.",
                nameof(defaultCurrency));
        }

        return normalizedCurrency;
    }
}
