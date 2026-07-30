namespace BudgetApp.Domain.Tutorials;

public sealed class TutorialProgress
{
    public const int TutorialKeyMaxLength = 100;

    private TutorialProgress()
    {
    }

    private TutorialProgress(
        Guid id,
        Guid userId,
        string tutorialKey,
        int tutorialVersion,
        DateTimeOffset startedAtUtc)
    {
        Id = id;
        UserId = ValidateRequiredId(userId, nameof(userId));
        TutorialKey = ValidateKey(tutorialKey);
        TutorialVersion = ValidateVersion(tutorialVersion);
        Status = TutorialProgressStatus.InProgress;
        CurrentStepIndex = 0;
        StartedAtUtc = startedAtUtc;
        UpdatedAtUtc = startedAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public string TutorialKey { get; private set; } = string.Empty;

    public int TutorialVersion { get; private set; }

    public TutorialProgressStatus Status { get; private set; }

    public int CurrentStepIndex { get; private set; }

    public DateTimeOffset StartedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public DateTimeOffset? CompletedAtUtc { get; private set; }

    public DateTimeOffset? DismissedAtUtc { get; private set; }

    public static TutorialProgress Start(
        Guid userId,
        string tutorialKey,
        int tutorialVersion,
        DateTimeOffset startedAtUtc) =>
        new(
            Guid.NewGuid(),
            userId,
            tutorialKey,
            tutorialVersion,
            startedAtUtc);

    public void Record(
        TutorialProgressStatus status,
        int currentStepIndex,
        DateTimeOffset updatedAtUtc)
    {
        if (!Enum.IsDefined(status))
            throw new ArgumentOutOfRangeException(nameof(status));
        if (currentStepIndex < 0)
            throw new ArgumentOutOfRangeException(nameof(currentStepIndex));

        Status = status;
        CurrentStepIndex = currentStepIndex;
        UpdatedAtUtc = updatedAtUtc;
        CompletedAtUtc = status == TutorialProgressStatus.Completed
            ? updatedAtUtc
            : null;
        DismissedAtUtc = status == TutorialProgressStatus.Dismissed
            ? updatedAtUtc
            : null;
    }

    private static Guid ValidateRequiredId(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
            throw new ArgumentException("User ID is required.", parameterName);
        return value;
    }

    private static string ValidateKey(string tutorialKey)
    {
        if (string.IsNullOrWhiteSpace(tutorialKey))
            throw new ArgumentException("Tutorial key is required.", nameof(tutorialKey));
        var value = tutorialKey.Trim();
        if (value.Length > TutorialKeyMaxLength)
            throw new ArgumentException(
                $"Tutorial key cannot exceed {TutorialKeyMaxLength} characters.",
                nameof(tutorialKey));
        return value;
    }

    private static int ValidateVersion(int tutorialVersion)
    {
        if (tutorialVersion <= 0)
            throw new ArgumentOutOfRangeException(nameof(tutorialVersion));
        return tutorialVersion;
    }
}
