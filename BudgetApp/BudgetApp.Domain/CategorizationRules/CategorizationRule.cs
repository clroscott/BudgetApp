namespace BudgetApp.Domain.CategorizationRules;

public sealed class CategorizationRule
{
    public const int NameMaxLength = 100;
    public const int MatchValueMaxLength = 200;

    private CategorizationRule()
    {
    }

    private CategorizationRule(
        Guid id,
        Guid householdId,
        string name,
        CategorizationRuleMatchField matchField,
        CategorizationRuleMatchOperator matchOperator,
        string matchValue,
        Guid? accountId,
        Guid targetCategoryId,
        int priority,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = ValidateRequiredId(householdId, nameof(householdId));
        SetDefinition(
            name,
            matchField,
            matchOperator,
            matchValue,
            accountId,
            targetCategoryId);
        Priority = ValidatePriority(priority);
        IsActive = true;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid HouseholdId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string NormalizedName { get; private set; } = string.Empty;

    public CategorizationRuleMatchField MatchField { get; private set; }

    public CategorizationRuleMatchOperator MatchOperator { get; private set; }

    public string MatchValue { get; private set; } = string.Empty;

    public string NormalizedMatchValue { get; private set; } = string.Empty;

    public Guid? AccountId { get; private set; }

    public Guid TargetCategoryId { get; private set; }

    public int Priority { get; private set; }

    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static CategorizationRule Create(
        Guid householdId,
        string name,
        CategorizationRuleMatchField matchField,
        CategorizationRuleMatchOperator matchOperator,
        string matchValue,
        Guid? accountId,
        Guid targetCategoryId,
        int priority,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            householdId,
            name,
            matchField,
            matchOperator,
            matchValue,
            accountId,
            targetCategoryId,
            priority,
            createdAtUtc);

    public void Update(
        string name,
        CategorizationRuleMatchField matchField,
        CategorizationRuleMatchOperator matchOperator,
        string matchValue,
        Guid? accountId,
        Guid targetCategoryId,
        DateTimeOffset updatedAtUtc)
    {
        SetDefinition(
            name,
            matchField,
            matchOperator,
            matchValue,
            accountId,
            targetCategoryId);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void SetPriority(int priority, DateTimeOffset updatedAtUtc)
    {
        Priority = ValidatePriority(priority);
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

    public bool Matches(Guid accountId, string? description)
    {
        if (!IsActive ||
            (AccountId.HasValue && AccountId.Value != accountId) ||
            string.IsNullOrWhiteSpace(description))
        {
            return false;
        }

        var candidate = description.Trim();
        return MatchOperator switch
        {
            CategorizationRuleMatchOperator.Contains =>
                candidate.Contains(MatchValue, StringComparison.OrdinalIgnoreCase),
            CategorizationRuleMatchOperator.StartsWith =>
                candidate.StartsWith(MatchValue, StringComparison.OrdinalIgnoreCase),
            CategorizationRuleMatchOperator.EndsWith =>
                candidate.EndsWith(MatchValue, StringComparison.OrdinalIgnoreCase),
            CategorizationRuleMatchOperator.Exact =>
                string.Equals(candidate, MatchValue, StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }

    private void SetDefinition(
        string name,
        CategorizationRuleMatchField matchField,
        CategorizationRuleMatchOperator matchOperator,
        string matchValue,
        Guid? accountId,
        Guid targetCategoryId)
    {
        Name = ValidateText(name, NameMaxLength, nameof(name), "Rule name");
        NormalizedName = Name.ToUpperInvariant();
        MatchField = ValidateEnum(matchField, nameof(matchField));
        MatchOperator = ValidateEnum(matchOperator, nameof(matchOperator));
        MatchValue = ValidateText(
            matchValue,
            MatchValueMaxLength,
            nameof(matchValue),
            "Match text");
        NormalizedMatchValue = MatchValue.ToUpperInvariant();
        AccountId = ValidateOptionalId(accountId, nameof(accountId));
        TargetCategoryId = ValidateRequiredId(
            targetCategoryId,
            nameof(targetCategoryId));
    }

    private static TEnum ValidateEnum<TEnum>(TEnum value, string parameterName)
        where TEnum : struct, Enum
    {
        if (!Enum.IsDefined(value))
        {
            throw new ArgumentOutOfRangeException(
                parameterName,
                $"{typeof(TEnum).Name} is not supported.");
        }

        return value;
    }

    private static int ValidatePriority(int priority)
    {
        if (priority < 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(priority),
                "Priority cannot be negative.");
        }

        return priority;
    }

    private static Guid ValidateRequiredId(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("A valid ID is required.", parameterName);
        }

        return value;
    }

    private static Guid? ValidateOptionalId(Guid? value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException(
                "The ID cannot be empty when provided.",
                parameterName);
        }

        return value;
    }

    private static string ValidateText(
        string value,
        int maxLength,
        string parameterName,
        string displayName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{displayName} is required.", parameterName);
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            throw new ArgumentException(
                $"{displayName} cannot exceed {maxLength} characters.",
                parameterName);
        }

        return trimmed;
    }
}
