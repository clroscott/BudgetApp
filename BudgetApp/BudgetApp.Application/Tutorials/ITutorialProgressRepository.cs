using BudgetApp.Domain.Tutorials;

namespace BudgetApp.Application.Tutorials;

public interface ITutorialProgressRepository
{
    Task<IReadOnlyList<TutorialProgress>> ListAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task<TutorialProgress?> GetForUpdateAsync(
        Guid userId,
        string tutorialKey,
        int tutorialVersion,
        CancellationToken cancellationToken);

    Task AddAsync(
        TutorialProgress progress,
        CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
