using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Imports;

internal sealed class ImportProfileRepository(BudgetAppDbContext dbContext)
    : IImportProfileRepository
{
    public async Task<IReadOnlyList<ImportProfile>> ListAsync(
        Guid householdId,
        bool includeInactive,
        CancellationToken cancellationToken) =>
        await dbContext.ImportProfiles.AsNoTracking()
            .Where(profile =>
                profile.HouseholdId == householdId &&
                (includeInactive || profile.IsActive))
            .OrderBy(profile => profile.Name)
            .ToListAsync(cancellationToken);

    public Task<ImportProfile?> GetAsync(
        Guid householdId,
        Guid profileId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var query = dbContext.ImportProfiles.AsQueryable();
        if (!forUpdate) query = query.AsNoTracking();
        return query.SingleOrDefaultAsync(profile =>
            profile.HouseholdId == householdId && profile.Id == profileId,
            cancellationToken);
    }

    public Task<ImportProfile?> FindMatchAsync(
        Guid householdId,
        string headerSignature,
        Guid? accountId,
        CancellationToken cancellationToken) =>
        dbContext.ImportProfiles.AsNoTracking()
            .Where(profile =>
                profile.HouseholdId == householdId &&
                profile.IsActive &&
                profile.HeaderSignature == headerSignature)
            .OrderByDescending(profile =>
                accountId.HasValue && profile.DefaultAccountId == accountId)
            .ThenBy(profile => profile.Name)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task AddAsync(
        ImportProfile profile,
        CancellationToken cancellationToken) =>
        await dbContext.ImportProfiles.AddAsync(profile, cancellationToken);

    public async Task ClearDefaultAccountAsync(
        Guid householdId,
        Guid accountId,
        Guid exceptProfileId,
        CancellationToken cancellationToken)
    {
        var profiles = await dbContext.ImportProfiles
            .Where(profile =>
                profile.HouseholdId == householdId &&
                profile.Id != exceptProfileId &&
                profile.DefaultAccountId == accountId)
            .ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        foreach (var profile in profiles)
            profile.Update(
                profile.Name, profile.GetHeaders(), profile.DateColumn,
                profile.DescriptionColumn, profile.AmountColumn,
                profile.DebitColumn, profile.CreditColumn,
                profile.CategoryColumn, profile.SubcategoryColumn,
                profile.AmountConvention, null, now);
    }

    public void Remove(ImportProfile profile) =>
        dbContext.ImportProfiles.Remove(profile);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
