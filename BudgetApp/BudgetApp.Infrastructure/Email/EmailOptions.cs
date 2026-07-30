namespace BudgetApp.Infrastructure.Email;

public sealed class EmailOptions
{
    public const string DisabledMode = "Disabled";
    public const string FileMode = "File";

    public string DeliveryMode { get; init; } = DisabledMode;

    public string SenderName { get; init; } = "MC Budget";

    public string SenderAddress { get; init; } = "no-reply@example.test";

    public string? FileOutboxPath { get; init; }
}

public sealed class ApplicationUrlOptions
{
    public string PublicBaseUrl { get; init; } = "https://localhost";
}
