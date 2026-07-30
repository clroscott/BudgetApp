namespace BudgetApp.Application.Tutorials;

public sealed record TutorialProgressModel(
    string TutorialKey,
    int TutorialVersion,
    string Status,
    int CurrentStepIndex,
    DateTimeOffset StartedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? CompletedAtUtc,
    DateTimeOffset? DismissedAtUtc);
