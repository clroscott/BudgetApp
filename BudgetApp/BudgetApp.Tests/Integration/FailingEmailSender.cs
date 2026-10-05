using BudgetApp.Application.Email;

namespace BudgetApp.Tests.Integration;

internal sealed class FailingEmailSender : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default) =>
        throw new EmailDeliveryException("Simulated failure.", failureKind: EmailDeliveryFailureKind.Authentication);
}
