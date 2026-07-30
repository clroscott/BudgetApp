using Microsoft.Extensions.Logging;

namespace BudgetApp.Application.Email;

public sealed class EmailDispatchService(
    IEmailSender emailSender,
    ILogger<EmailDispatchService> logger)
{
    public async Task<EmailDispatchResult> SendAsync(
        EmailMessage message,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);

        try
        {
            await emailSender.SendAsync(message, cancellationToken);

            logger.LogInformation(
                "Email dispatch completed for purpose {EmailPurpose}",
                message.Purpose);

            return EmailDispatchResult.Success();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "Email dispatch failed for purpose {EmailPurpose}",
                message.Purpose);

            return EmailDispatchResult.Failure();
        }
    }
}

public sealed record EmailDispatchResult(bool Succeeded)
{
    public static EmailDispatchResult Success() => new(true);

    public static EmailDispatchResult Failure() => new(false);
}
