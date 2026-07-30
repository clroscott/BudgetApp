using BudgetApp.Application.Tutorials;
using BudgetApp.Domain.Tutorials;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Tutorials;

internal sealed class TutorialProgressRepository(BudgetAppDbContext dbContext)
    : ITutorialProgressRepository
{
    public async Task<IReadOnlyList<TutorialProgress>> ListAsync(
        Guid userId,
        CancellationToken cancellationToken) =>
        await dbContext.TutorialProgress
            .AsNoTracking()
            .Where(progress => progress.UserId == userId)
            .OrderBy(progress => progress.TutorialKey)
            .ThenByDescending(progress => progress.TutorialVersion)
            .ToListAsync(cancellationToken);

    public Task<TutorialProgress?> GetForUpdateAsync(
        Guid userId,
        string tutorialKey,
        int tutorialVersion,
        CancellationToken cancellationToken) =>
        dbContext.TutorialProgress.SingleOrDefaultAsync(
            progress =>
                progress.UserId == userId &&
                progress.TutorialKey == tutorialKey &&
                progress.TutorialVersion == tutorialVersion,
            cancellationToken);

    public Task AddAsync(
        TutorialProgress progress,
        CancellationToken cancellationToken) =>
        dbContext.TutorialProgress.AddAsync(progress, cancellationToken).AsTask();

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
