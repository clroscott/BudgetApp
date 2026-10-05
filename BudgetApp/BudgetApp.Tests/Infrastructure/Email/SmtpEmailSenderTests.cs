using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Email;
using MailKit.Net.Smtp;

namespace BudgetApp.Tests.Infrastructure.Email;

public sealed class SmtpEmailSenderTests
{
    [Fact]
    public async Task SendAsync_AuthenticatesOverTlsAndSendsBothBodies()
    {
        await using var server = new LoopbackSmtpServer();
        var sender = CreateSender(server);
        var message = CreateMessage();

        await sender.SendAsync(message);
        await server.CompleteAsync();

        Assert.True(server.UsedTls);
        Assert.Equal("\0sender@example.com\0test-app-password", server.AuthenticationPayload);
        Assert.Equal("sender@example.com", Assert.Single(server.Message!.From.Mailboxes).Address);
        Assert.Equal("MC Budget", Assert.Single(server.Message.From.Mailboxes).Name);
        Assert.Equal(message.RecipientAddress, Assert.Single(server.Message.To.Mailboxes).Address);
        Assert.Equal(message.Subject, server.Message.Subject);
        Assert.Equal(message.PlainTextBody, server.Message.TextBody);
        Assert.Equal(message.HtmlBody, server.Message.HtmlBody);
    }

    [Fact]
    public async Task SendAsync_RefusesUnencryptedServerBeforeSendingCredentials()
    {
        await using var server = new LoopbackSmtpServer(advertiseTls: false);

        var failure = await Assert.ThrowsAsync<EmailDeliveryException>(() => CreateSender(server).SendAsync(CreateMessage()));

        Assert.Equal(EmailDeliveryFailureKind.SecureConnection, failure.FailureKind);
        Assert.Null(server.AuthenticationPayload);
        Assert.Null(server.Message);
    }

    [Fact]
    public async Task SendAsync_RejectsUntrustedCertificateWithProductionFactory()
    {
        await using var server = new LoopbackSmtpServer();
        var sender = new SmtpEmailSender(CreateOptions(server.Port), new SmtpClientFactory());

        var failure = await Assert.ThrowsAsync<EmailDeliveryException>(() => sender.SendAsync(CreateMessage()));

        Assert.Equal(EmailDeliveryFailureKind.SecureConnection, failure.FailureKind);
        Assert.Null(server.AuthenticationPayload);
    }

    [Theory]
    [InlineData(true, false, EmailDeliveryFailureKind.Authentication)]
    [InlineData(false, true, EmailDeliveryFailureKind.Rejected)]
    public async Task SendAsync_ReportsSanitizedProviderFailure(bool rejectAuthentication, bool rejectRecipient, EmailDeliveryFailureKind kind)
    {
        await using var server = new LoopbackSmtpServer(rejectAuthentication: rejectAuthentication, rejectRecipient: rejectRecipient);

        var failure = await Assert.ThrowsAsync<EmailDeliveryException>(() => CreateSender(server).SendAsync(CreateMessage()));

        Assert.Equal(kind, failure.FailureKind);
        Assert.Null(failure.InnerException);
        Assert.DoesNotContain("confidential-provider-response", failure.ToString());
        Assert.DoesNotContain("test-app-password", failure.ToString());
        Assert.Null(server.Message);
    }

    [Fact]
    public async Task SendAsync_TimesOutWhenServerDoesNotRespond()
    {
        await using var server = new LoopbackSmtpServer(stall: true);
        var sender = new SmtpEmailSender(CreateOptions(server.Port, timeoutSeconds: 1), new SmtpClientFactory());

        var failure = await Assert.ThrowsAsync<EmailDeliveryException>(() => sender.SendAsync(CreateMessage()));

        Assert.Equal(EmailDeliveryFailureKind.Timeout, failure.FailureKind);
    }

    [Fact]
    public async Task SendAsync_PreservesCallerCancellation()
    {
        await using var server = new LoopbackSmtpServer(stall: true);
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => CreateSender(server).SendAsync(CreateMessage(), cancellation.Token));
    }

    [Theory]
    [InlineData("first@example.com, second@example.com")]
    [InlineData("not-an-address")]
    public async Task SendAsync_RejectsInvalidRecipientWithoutConnecting(string address)
    {
        var sender = new SmtpEmailSender(CreateOptions(587), new SmtpClientFactory());
        var message = CreateMessage() with { RecipientAddress = address };

        var failure = await Assert.ThrowsAsync<EmailDeliveryException>(() => sender.SendAsync(message));

        Assert.Equal(EmailDeliveryFailureKind.InvalidMessage, failure.FailureKind);
    }

    private static SmtpEmailSender CreateSender(LoopbackSmtpServer server) =>
        new(CreateOptions(server.Port), new TestClientFactory(server));

    private static EmailOptions CreateOptions(int port, int timeoutSeconds = 5) => new()
    {
        DeliveryMode = EmailOptions.SmtpMode,
        SenderAddress = "sender@example.com",
        SenderName = "MC Budget",
        Smtp = new SmtpEmailOptions
        {
            Host = "localhost",
            Port = port,
            Username = "sender@example.com",
            Password = "test-app-password",
            TimeoutSeconds = timeoutSeconds
        }
    };

    private static EmailMessage CreateMessage() => new(
        "recipient@example.com", "MC Budget invitation", "A link: https://localhost/invite?token=test", "<p>A test invitation</p>", EmailPurpose.HouseholdInvitation);

    private sealed class TestClientFactory(LoopbackSmtpServer server) : ISmtpClientFactory
    {
        public SmtpClient Create() => new()
        {
            // Trust only this generated loopback certificate, in tests only.
            ServerCertificateValidationCallback = (_, certificate, _, _) =>
                certificate?.GetCertHashString() == server.Certificate.GetCertHashString()
        };
    }
}
