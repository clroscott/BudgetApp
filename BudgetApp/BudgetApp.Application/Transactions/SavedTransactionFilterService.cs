using System.Text.Json;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Transactions;

namespace BudgetApp.Application.Transactions;

public sealed class SavedTransactionFilterService(ISavedTransactionFilterRepository repository,
    HouseholdAuthorizationService authorization)
{
    public async Task<IReadOnlyList<SavedTransactionFilterModel>> ListAsync(Guid householdId, Guid userId, CancellationToken token)
    {
        await authorization.RequireViewAsync(householdId, userId, token);
        var models = new List<SavedTransactionFilterModel>();
        foreach (var filter in await repository.ListAsync(householdId, userId, token))
            models.Add(await ToModel(filter, token));
        return models;
    }

    public async Task<SavedTransactionFilterModel> GetAsync(Guid householdId, Guid userId, Guid id, CancellationToken token)
    {
        await authorization.RequireViewAsync(householdId, userId, token);
        return await ToModel(await Find(householdId, userId, id, token), token);
    }

    public async Task<SavedTransactionFilterModel> CreateAsync(Guid householdId, Guid userId, Guid id,
        string name, SavedTransactionFilterDefinition filters, CancellationToken token)
    {
        await authorization.RequireViewAsync(householdId, userId, token);
        ArgumentNullException.ThrowIfNull(filters);
        var normalized = filters.Normalize();
        var json = JsonSerializer.Serialize(normalized);
        var candidate = SavedTransactionFilter.Create(id, householdId, userId, name, json);
        var existing = await repository.FindAsync(householdId, userId, id, token);
        // The caller retains the creation ID on failure: a lost response can be retried safely.
        if (existing is not null)
        {
            if (existing.Name != candidate.Name || existing.DefinitionJson != json)
                throw new SavedFilterConflictException("This saved-filter request was already used. Reload your saved filters.");
            return await ToModel(existing, token);
        }
        var references = await repository.UnavailableReferencesAsync(householdId, userId, normalized, token);
        if (references.Count > 0) throw new ArgumentException(string.Join(" ", references));
        var own = await repository.ListAsync(householdId, userId, token);
        if (own.Count >= 100) throw new ArgumentException("You can save up to 100 filters per household. Delete one before saving another.");
        CheckName(own, candidate.NormalizedName, id);
        repository.Add(candidate);
        await repository.SaveAsync(token);
        return await ToModel(candidate, token);
    }

    public async Task<SavedTransactionFilterModel> RenameAsync(Guid householdId, Guid userId, Guid id,
        string name, Guid version, CancellationToken token)
    {
        await authorization.RequireViewAsync(householdId, userId, token);
        var filter = await Find(householdId, userId, id, token);
        // Idempotent rename retry after a response was lost.
        if (filter.Name == name?.Trim()) return await ToModel(filter, token);
        CheckVersion(filter, version);
        var candidate = SavedTransactionFilter.Create(id, householdId, userId, name!, filter.DefinitionJson);
        CheckName(await repository.ListAsync(householdId, userId, token), candidate.NormalizedName, id);
        filter.Rename(name!);
        await repository.SaveAsync(token);
        return await ToModel(filter, token);
    }

    public async Task DeleteAsync(Guid householdId, Guid userId, Guid id, Guid version, CancellationToken token)
    {
        await authorization.RequireViewAsync(householdId, userId, token);
        var filter = await repository.FindAsync(householdId, userId, id, token);
        if (filter is null) return; // Safe retry; never look up somebody else's preference.
        CheckVersion(filter, version);
        repository.Remove(filter);
        await repository.SaveAsync(token);
    }

    private async Task<SavedTransactionFilter> Find(Guid householdId, Guid userId, Guid id, CancellationToken token) =>
        await repository.FindAsync(householdId, userId, id, token) ?? throw new SavedFilterNotFoundException();
    private async Task<SavedTransactionFilterModel> ToModel(SavedTransactionFilter filter, CancellationToken token)
    {
        var definition = JsonSerializer.Deserialize<SavedTransactionFilterDefinition>(filter.DefinitionJson)!;
        return new(filter.Id, filter.Name, definition, filter.Version,
            await repository.UnavailableReferencesAsync(filter.HouseholdId, filter.UserId, definition, token));
    }
    private static void CheckVersion(SavedTransactionFilter filter, Guid version)
    {
        if (filter.Version != version) throw new SavedFilterConflictException("Saved filter changed elsewhere. Reload saved filters before trying again.");
    }
    private static void CheckName(IReadOnlyList<SavedTransactionFilter> filters, string normalized, Guid id)
    {
        if (filters.Any(filter => filter.Id != id && filter.NormalizedName == normalized))
            throw new SavedFilterConflictException("You already have a saved filter with this name in this household.");
    }
}
