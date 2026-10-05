namespace BudgetApp.Infrastructure.Email;

public sealed class EmailOptions
{
    public const string DisabledMode = "Disabled";
    public const string FileMode = "File";
    public const string SmtpMode = "Smtp";

    public string DeliveryMode { get; init; } = DisabledMode;

    public string SenderName { get; init; } = "MC Budget";

    public string SenderAddress { get; init; } = "no-reply@example.test";

    public string? FileOutboxPath { get; init; }

    public SmtpEmailOptions Smtp { get; init; } = new();
}

public sealed class SmtpEmailOptions
{
    public string Host { get; init; } = "";

    public int Port { get; init; } = 587;

    public string Security { get; init; } = "StartTls";

    public string Username { get; init; } = "";

    public string Password { get; init; } = "";

    public int TimeoutSeconds { get; init; } = 30;
}

public sealed class ApplicationUrlOptions
{
    public string PublicBaseUrl { get; init; } = "https://localhost";
}
