using BudgetApp.Application.Email;
using Microsoft.Extensions.Logging;
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

    [Fact]
    public async Task SendAsync_DoesNotLogRawProviderErrorsOrMessageContents()
    {
        var logger = new CapturingLogger();
        var service = new EmailDispatchService(new SensitiveFailureSender(), logger);

        var result = await service.SendAsync(CreateMessage());

        Assert.False(result.Succeeded);
        Assert.Single(logger.Messages);
        Assert.DoesNotContain("private-provider-response", logger.Messages[0]);
        Assert.DoesNotContain("person@example.test", logger.Messages[0]);
        Assert.DoesNotContain("Plain text", logger.Messages[0]);
        Assert.Null(logger.Exception);
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

    private sealed class SensitiveFailureSender : IEmailSender
    {
        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("private-provider-response person@example.test Plain text");
    }

    private sealed class CapturingLogger : ILogger<EmailDispatchService>
    {
        public List<string> Messages { get; } = [];
        public Exception? Exception { get; private set; }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Messages.Add(formatter(state, exception));
            Exception = exception;
        }
    }
}
