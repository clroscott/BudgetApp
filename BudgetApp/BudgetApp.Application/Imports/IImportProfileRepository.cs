using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public interface IImportProfileRepository
{
    Task<IReadOnlyList<ImportProfile>> ListAsync(
        Guid householdId,
        bool includeInactive,
        CancellationToken cancellationToken);

    Task<ImportProfile?> GetAsync(
        Guid householdId,
        Guid profileId,
        bool forUpdate,
        CancellationToken cancellationToken);

    Task<ImportProfile?> FindMatchAsync(
        Guid householdId,
        string headerSignature,
        Guid? accountId,
        CancellationToken cancellationToken);

    Task AddAsync(ImportProfile profile, CancellationToken cancellationToken);
    Task ClearDefaultAccountAsync(
        Guid householdId,
        Guid accountId,
        Guid exceptProfileId,
        CancellationToken cancellationToken);
    void Remove(ImportProfile profile);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
