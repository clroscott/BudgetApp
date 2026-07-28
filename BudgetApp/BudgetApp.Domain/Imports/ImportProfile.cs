using System.Security.Cryptography;
using System.Text;

namespace BudgetApp.Domain.Imports;

public sealed class ImportProfile
{
    public const int NameMaxLength = 100;
    public const int HeaderNameMaxLength = 100;
    public const int HeadersMaxLength = 2000;
    private const char HeaderSeparator = '\u001f';

    private ImportProfile()
    {
    }

    private ImportProfile(
        Guid id,
        Guid householdId,
        string name,
        IReadOnlyList<string> headers,
        string dateColumn,
        string descriptionColumn,
        string? amountColumn,
        string? debitColumn,
        string? creditColumn,
        string? categoryColumn,
        string? subcategoryColumn,
        ImportAmountConvention amountConvention,
        Guid? defaultAccountId,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        HouseholdId = RequireId(householdId, nameof(householdId));
        SetDetails(
            name, headers, dateColumn, descriptionColumn, amountColumn,
            debitColumn, creditColumn, categoryColumn, subcategoryColumn,
            amountConvention, defaultAccountId);
        IsActive = true;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string Headers { get; private set; } = string.Empty;
    public string HeaderSignature { get; private set; } = string.Empty;
    public string DateColumn { get; private set; } = string.Empty;
    public string DescriptionColumn { get; private set; } = string.Empty;
    public string? AmountColumn { get; private set; }
    public string? DebitColumn { get; private set; }
    public string? CreditColumn { get; private set; }
    public string? CategoryColumn { get; private set; }
    public string? SubcategoryColumn { get; private set; }
    public ImportAmountConvention AmountConvention { get; private set; }
    public Guid? DefaultAccountId { get; private set; }
    public bool IsActive { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public IReadOnlyList<string> GetHeaders() => Headers.Split(HeaderSeparator);

    public static ImportProfile Create(
        Guid householdId,
        string name,
        IReadOnlyList<string> headers,
        string dateColumn,
        string descriptionColumn,
        string? amountColumn,
        string? debitColumn,
        string? creditColumn,
        string? categoryColumn,
        string? subcategoryColumn,
        ImportAmountConvention amountConvention,
        Guid? defaultAccountId,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(), householdId, name, headers, dateColumn,
            descriptionColumn, amountColumn, debitColumn, creditColumn,
            categoryColumn, subcategoryColumn, amountConvention,
            defaultAccountId, createdAtUtc);

    public void Update(
        string name,
        IReadOnlyList<string> headers,
        string dateColumn,
        string descriptionColumn,
        string? amountColumn,
        string? debitColumn,
        string? creditColumn,
        string? categoryColumn,
        string? subcategoryColumn,
        ImportAmountConvention amountConvention,
        Guid? defaultAccountId,
        DateTimeOffset updatedAtUtc)
    {
        SetDetails(
            name, headers, dateColumn, descriptionColumn, amountColumn,
            debitColumn, creditColumn, categoryColumn, subcategoryColumn,
            amountConvention, defaultAccountId);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Deactivate(DateTimeOffset updatedAtUtc)
    {
        IsActive = false;
        DefaultAccountId = null;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Reactivate(DateTimeOffset updatedAtUtc)
    {
        IsActive = true;
        UpdatedAtUtc = updatedAtUtc;
    }

    public static string BuildHeaderSignature(IEnumerable<string> headers)
    {
        var normalized = headers.Select(NormalizeHeader).ToArray();
        return Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes(string.Join(HeaderSeparator, normalized))));
    }

    private void SetDetails(
        string name,
        IReadOnlyList<string> headers,
        string dateColumn,
        string descriptionColumn,
        string? amountColumn,
        string? debitColumn,
        string? creditColumn,
        string? categoryColumn,
        string? subcategoryColumn,
        ImportAmountConvention amountConvention,
        Guid? defaultAccountId)
    {
        ArgumentNullException.ThrowIfNull(headers);
        var cleanHeaders = headers.Select(CleanHeader).ToList();
        if (cleanHeaders.Count == 0 || cleanHeaders.Count > 100)
            throw new ArgumentException("Provide between 1 and 100 CSV headers.", nameof(headers));
        if (cleanHeaders.Select(NormalizeHeader).Distinct().Count() != cleanHeaders.Count)
            throw new ArgumentException("CSV headers must be unique.", nameof(headers));
        var serialized = string.Join(HeaderSeparator, cleanHeaders);
        if (serialized.Length > HeadersMaxLength)
            throw new ArgumentException("CSV headers are too long.", nameof(headers));

        Name = CleanRequired(name, NameMaxLength, nameof(name), "Profile name");
        DateColumn = RequireMappedColumn(dateColumn, cleanHeaders, nameof(dateColumn));
        DescriptionColumn = RequireMappedColumn(
            descriptionColumn, cleanHeaders, nameof(descriptionColumn));
        AmountColumn = OptionalMappedColumn(amountColumn, cleanHeaders, nameof(amountColumn));
        DebitColumn = OptionalMappedColumn(debitColumn, cleanHeaders, nameof(debitColumn));
        CreditColumn = OptionalMappedColumn(creditColumn, cleanHeaders, nameof(creditColumn));
        CategoryColumn = OptionalMappedColumn(categoryColumn, cleanHeaders, nameof(categoryColumn));
        SubcategoryColumn = OptionalMappedColumn(
            subcategoryColumn, cleanHeaders, nameof(subcategoryColumn));
        if (AmountColumn is null && DebitColumn is null && CreditColumn is null)
            throw new ArgumentException("Map an Amount column or Debit/Credit columns.");
        if (AmountColumn is not null && (DebitColumn is not null || CreditColumn is not null))
            throw new ArgumentException("Use either Amount or Debit/Credit columns, not both.");
        if (!Enum.IsDefined(amountConvention))
            throw new ArgumentOutOfRangeException(nameof(amountConvention));
        if (defaultAccountId == Guid.Empty)
            throw new ArgumentException("Default account ID cannot be empty.", nameof(defaultAccountId));

        Headers = serialized;
        HeaderSignature = BuildHeaderSignature(cleanHeaders);
        AmountConvention = amountConvention;
        DefaultAccountId = defaultAccountId;
    }

    private static string RequireMappedColumn(
        string value, IReadOnlyList<string> headers, string parameterName) =>
        OptionalMappedColumn(value, headers, parameterName)
        ?? throw new ArgumentException("A mapped column is required.", parameterName);

    private static string? OptionalMappedColumn(
        string? value, IReadOnlyList<string> headers, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var match = headers.SingleOrDefault(header =>
            NormalizeHeader(header) == NormalizeHeader(value));
        return match ?? throw new ArgumentException(
            $"Mapped column '{value.Trim()}' is not in the profile headers.", parameterName);
    }

    private static string CleanHeader(string value)
    {
        var clean = CleanRequired(value, HeaderNameMaxLength, nameof(value), "Header");
        if (clean.Contains(HeaderSeparator))
            throw new ArgumentException("Header contains an unsupported control character.");
        return clean;
    }

    private static string CleanRequired(
        string value, int maxLength, string parameterName, string displayName)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException($"{displayName} is required.", parameterName);
        var clean = value.Trim();
        if (clean.Length > maxLength)
            throw new ArgumentException(
                $"{displayName} cannot exceed {maxLength} characters.", parameterName);
        return clean;
    }

    private static string NormalizeHeader(string value) =>
        new(value.Trim().Where(char.IsLetterOrDigit)
            .Select(char.ToLowerInvariant).ToArray());

    private static Guid RequireId(Guid value, string parameterName) =>
        value == Guid.Empty
            ? throw new ArgumentException("ID is required.", parameterName)
            : value;
}
