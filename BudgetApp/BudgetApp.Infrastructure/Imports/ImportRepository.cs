using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Imports;

internal sealed class ImportRepository(BudgetAppDbContext dbContext)
    : IImportRepository
{
    public Task<bool> ExistsByAccountAndHashAsync(
        Guid accountId,
        string sha256Hash,
        CancellationToken cancellationToken) =>
        dbContext.ImportFiles.AsNoTracking().AnyAsync(
            importFile =>
                importFile.AccountId == accountId &&
                importFile.Sha256Hash == sha256Hash,
            cancellationToken);

    public async Task AddAsync(
        ImportFile importFile,
        IReadOnlyCollection<ImportTransactionDraft> drafts,
        CancellationToken cancellationToken)
    {
        await dbContext.ImportFiles.AddAsync(importFile, cancellationToken);
        await dbContext.ImportTransactionDrafts.AddRangeAsync(
            drafts,
            cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
