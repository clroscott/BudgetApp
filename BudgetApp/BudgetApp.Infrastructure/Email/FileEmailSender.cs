using System.Text;
using BudgetApp.Application.Email;
using Microsoft.Extensions.Logging;

namespace BudgetApp.Infrastructure.Email;

public sealed class FileEmailSender(
    EmailOptions options,
    TimeProvider timeProvider,
    ILogger<FileEmailSender> logger) : IEmailSender
{
    public string OutboxPath { get; } = ResolveOutboxPath(options.FileOutboxPath);

    public async Task SendAsync(
        EmailMessage message,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);

        try
        {
            Directory.CreateDirectory(OutboxPath);

            var timestamp = timeProvider.GetUtcNow();
            var fileStem =
                $"{timestamp:yyyyMMdd-HHmmssfff}-{PurposeSlug(message.Purpose)}-{Guid.NewGuid():N}";
            var textPath = Path.Combine(OutboxPath, fileStem + ".txt");
            var emlPath = Path.Combine(OutboxPath, fileStem + ".eml");

            await File.WriteAllTextAsync(
                textPath,
                BuildReadableText(message, options, timestamp),
                Encoding.UTF8,
                cancellationToken);
            await File.WriteAllTextAsync(
                emlPath,
                BuildEml(message, options, timestamp),
                Encoding.UTF8,
                cancellationToken);

            logger.LogInformation(
                "Development email for purpose {EmailPurpose} was written to local outbox {OutboxPath}",
                message.Purpose,
                OutboxPath);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new EmailDeliveryException(
                "The development email could not be written to the local outbox.",
                exception);
        }
    }

    private static string BuildReadableText(
        EmailMessage message,
        EmailOptions options,
        DateTimeOffset timestamp) =>
        $"""
        DEVELOPMENT EMAIL - NOT SENT
        Date: {timestamp:O}
        From: {options.SenderName} <{options.SenderAddress}>
        To: {message.RecipientAddress}
        Purpose: {message.Purpose}
        Subject: {message.Subject}

        {message.PlainTextBody}
        """;

    private static string BuildEml(
        EmailMessage message,
        EmailOptions options,
        DateTimeOffset timestamp)
    {
        var boundary = $"BudgetApp-{Guid.NewGuid():N}";
        var plainBody = Convert.ToBase64String(
            Encoding.UTF8.GetBytes(message.PlainTextBody));
        var htmlBody = Convert.ToBase64String(
            Encoding.UTF8.GetBytes(message.HtmlBody));

        return $"""
        Date: {timestamp:R}
        From: {options.SenderName} <{options.SenderAddress}>
        To: {message.RecipientAddress}
        Subject: {message.Subject}
        MIME-Version: 1.0
        Content-Type: multipart/alternative; boundary="{boundary}"
        X-BudgetApp-Development-Email: true

        --{boundary}
        Content-Type: text/plain; charset=utf-8
        Content-Transfer-Encoding: base64

        {plainBody}
        --{boundary}
        Content-Type: text/html; charset=utf-8
        Content-Transfer-Encoding: base64

        {htmlBody}
        --{boundary}--
        """;
    }

    private static string ResolveOutboxPath(string? configuredPath)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.GetFullPath(configuredPath);
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "BudgetApp",
            "development-email");
    }

    private static string PurposeSlug(EmailPurpose purpose) =>
        purpose switch
        {
            EmailPurpose.PasswordRecovery => "password-recovery",
            EmailPurpose.HouseholdInvitation => "household-invitation",
            _ => "informational"
        };
}
