namespace BudgetApp.Domain.Transactions;

// A private preference, not financial data or shared household activity.
public sealed class SavedTransactionFilter
{
    private SavedTransactionFilter() { }
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public Guid UserId { get; private set; }
    public string Name { get; private set; } = "";
    public string NormalizedName { get; private set; } = "";
    public string DefinitionJson { get; private set; } = "";
    public Guid Version { get; private set; }

    public static SavedTransactionFilter Create(Guid id, Guid householdId, Guid userId,
        string name, string definitionJson)
    {
        if (id == Guid.Empty || householdId == Guid.Empty || userId == Guid.Empty)
            throw new ArgumentException("Saved filter identifiers are required.");
        var result = new SavedTransactionFilter { Id = id, HouseholdId = householdId,
            UserId = userId, DefinitionJson = definitionJson };
        result.Rename(name);
        return result;
    }

    public void Rename(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        name = name.Trim();
        if (name.Length > 100) throw new ArgumentException("Filter name cannot exceed 100 characters.");
        Name = name;
        NormalizedName = name.ToUpperInvariant();
        Version = Guid.NewGuid();
    }
}
