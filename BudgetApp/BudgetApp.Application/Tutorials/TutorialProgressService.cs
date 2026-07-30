using BudgetApp.Domain.Tutorials;

namespace BudgetApp.Application.Tutorials;

public sealed class TutorialProgressService(
    ITutorialProgressRepository repository,
    TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<TutorialProgressModel>> ListAsync(
        Guid userId,
        CancellationToken cancellationToken) =>
        (await repository.ListAsync(userId, cancellationToken))
            .Select(ToModel)
            .ToList();

    public async Task<TutorialProgressModel> SaveAsync(
        Guid userId,
        string tutorialKey,
        int tutorialVersion,
        string status,
        int currentStepIndex,
        CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<TutorialProgressStatus>(status, true, out var parsedStatus) ||
            !Enum.IsDefined(parsedStatus))
        {
            throw new ArgumentException(
                "Tutorial status must be InProgress, Completed, or Dismissed.",
                nameof(status));
        }

        var progress = await repository.GetForUpdateAsync(
            userId,
            tutorialKey,
            tutorialVersion,
            cancellationToken);
        var now = timeProvider.GetUtcNow();
        if (progress is null)
        {
            progress = TutorialProgress.Start(
                userId,
                tutorialKey,
                tutorialVersion,
                now);
            await repository.AddAsync(progress, cancellationToken);
        }

        progress.Record(parsedStatus, currentStepIndex, now);
        await repository.SaveChangesAsync(cancellationToken);
        return ToModel(progress);
    }

    private static TutorialProgressModel ToModel(TutorialProgress progress) =>
        new(
            progress.TutorialKey,
            progress.TutorialVersion,
            progress.Status.ToString(),
            progress.CurrentStepIndex,
            progress.StartedAtUtc,
            progress.UpdatedAtUtc,
            progress.CompletedAtUtc,
            progress.DismissedAtUtc);
}
