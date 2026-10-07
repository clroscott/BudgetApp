using BudgetApp.Domain.Transactions;

namespace BudgetApp.Application.Transactions;

public interface ISavedTransactionFilterRepository
{
    Task<IReadOnlyList<SavedTransactionFilter>> ListAsync(Guid householdId, Guid userId, CancellationToken token);
    Task<SavedTransactionFilter?> FindAsync(Guid householdId, Guid userId, Guid id, CancellationToken token);
    Task<IReadOnlyList<string>> UnavailableReferencesAsync(Guid householdId, Guid userId,
        SavedTransactionFilterDefinition filters, CancellationToken token);
    void Add(SavedTransactionFilter filter);
    void Remove(SavedTransactionFilter filter);
    Task SaveAsync(CancellationToken token);
}

public sealed class SavedFilterNotFoundException() : Exception("Saved filter not found.");
public sealed class SavedFilterConflictException(string message) : Exception(message);
public sealed record SavedTransactionFilterModel(Guid Id, string Name,
    SavedTransactionFilterDefinition Filters, Guid Version, IReadOnlyList<string> UnavailableReferences);
