using BudgetApp.Application.Email;
using Microsoft.Extensions.Logging;

namespace BudgetApp.Infrastructure.Email;

public sealed class DisabledEmailSender(
    ILogger<DisabledEmailSender> logger) : IEmailSender
{
    public Task SendAsync(
        EmailMessage message,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        cancellationToken.ThrowIfCancellationRequested();

        logger.LogInformation(
            "Email delivery is disabled; message for purpose {EmailPurpose} was not sent",
            message.Purpose);

        return Task.CompletedTask;
    }
}
