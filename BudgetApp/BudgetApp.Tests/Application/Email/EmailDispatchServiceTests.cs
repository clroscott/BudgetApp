using BudgetApp.Application.Email;
using Microsoft.Extensions.Logging.Abstractions;

namespace BudgetApp.Tests.Application.Email;

public sealed class EmailDispatchServiceTests
{
    [Fact]
    public async Task SendAsync_ReturnsSuccessWhenSenderCompletes()
    {
        var sender = new RecordingEmailSender();
        var service = new EmailDispatchService(
            sender,
            NullLogger<EmailDispatchService>.Instance);
        var message = CreateMessage();

        var result = await service.SendAsync(message);

        Assert.True(result.Succeeded);
        Assert.Same(message, sender.Message);
    }

    [Fact]
    public async Task SendAsync_ReturnsFailureWhenSenderFails()
    {
        var service = new EmailDispatchService(
            new FailingEmailSender(),
            NullLogger<EmailDispatchService>.Instance);

        var result = await service.SendAsync(CreateMessage());

        Assert.False(result.Succeeded);
    }

    private static EmailMessage CreateMessage() =>
        new(
            "person@example.test",
            "Subject",
            "Plain text",
            "<p>HTML</p>",
            EmailPurpose.Informational);

    private sealed class RecordingEmailSender : IEmailSender
    {
        public EmailMessage? Message { get; private set; }

        public Task SendAsync(
            EmailMessage message,
            CancellationToken cancellationToken = default)
        {
            Message = message;
            return Task.CompletedTask;
        }
    }

    private sealed class FailingEmailSender : IEmailSender
    {
        public Task SendAsync(
            EmailMessage message,
            CancellationToken cancellationToken = default) =>
            throw new EmailDeliveryException("Simulated delivery failure.");
    }
}
