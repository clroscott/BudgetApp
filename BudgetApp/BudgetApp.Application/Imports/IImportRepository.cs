using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public interface IImportRepository
{
    Task<bool> ExistsByAccountAndHashAsync(
        Guid accountId,
        string sha256Hash,
        CancellationToken cancellationToken);

    Task AddAsync(
        ImportFile importFile,
        IReadOnlyCollection<ImportTransactionDraft> drafts,
        CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
