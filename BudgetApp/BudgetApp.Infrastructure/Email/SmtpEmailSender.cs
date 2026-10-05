using BudgetApp.Application.Email;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace BudgetApp.Infrastructure.Email;

public sealed class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions options;
    private readonly ISmtpClientFactory clientFactory;
    private readonly SecureSocketOptions socketOptions;

    public SmtpEmailSender(EmailOptions options, ISmtpClientFactory clientFactory)
    {
        this.options = options;
        this.clientFactory = clientFactory;
        socketOptions = ValidateOptions(options);
    }

    public static SecureSocketOptions ValidateOptions(EmailOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var smtp = options.Smtp;
        if (smtp is null || string.IsNullOrWhiteSpace(smtp.Host) ||
            Uri.CheckHostName(smtp.Host.Trim()) == UriHostNameType.Unknown)
        {
            throw new InvalidOperationException("Email:Smtp:Host must be a hostname, without a URL or port.");
        }

        if (smtp.Port is < 1 or > 65535 || smtp.TimeoutSeconds is < 1 or > 120)
        {
            throw new InvalidOperationException(
                "Email:Smtp:Port must be 1-65535 and TimeoutSeconds must be 1-120.");
        }

        if (string.IsNullOrWhiteSpace(smtp.Username) || string.IsNullOrWhiteSpace(smtp.Password))
        {
            throw new InvalidOperationException(
                "Email:Smtp:Username and Password must be supplied through backend secrets.");
        }

        if (!MailboxAddress.TryParse(options.SenderAddress, out var sender) ||
            !sender.Address.Contains('@') ||
            !sender.Address.Equals(options.SenderAddress.Trim(), StringComparison.OrdinalIgnoreCase) ||
            sender.Address.EndsWith(".test", StringComparison.OrdinalIgnoreCase) ||
            sender.Address.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Email:SenderAddress must be a real, single sender email address.");
        }

        var security = smtp.Security?.Trim();
        if (string.Equals(security, "StartTls", StringComparison.OrdinalIgnoreCase))
        {
            return SecureSocketOptions.StartTls;
        }

        if (string.Equals(security, "SslOnConnect", StringComparison.OrdinalIgnoreCase))
        {
            return SecureSocketOptions.SslOnConnect;
        }

        throw new InvalidOperationException(
            "Email:Smtp:Security must be 'StartTls' or 'SslOnConnect'; encrypted SMTP is required.");
    }

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        cancellationToken.ThrowIfCancellationRequested();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(options.Smtp.TimeoutSeconds));

        try
        {
            var mimeMessage = new MimeMessage();
            mimeMessage.From.Add(new MailboxAddress(options.SenderName, options.SenderAddress));
            if (!MailboxAddress.TryParse(message.RecipientAddress, out var recipient) ||
                !recipient.Address.Contains('@') ||
                !recipient.Address.Equals(message.RecipientAddress.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                throw new EmailDeliveryException(
                    "The email recipient address is invalid.",
                    failureKind: EmailDeliveryFailureKind.InvalidMessage);
            }

            mimeMessage.To.Add(recipient);
            mimeMessage.Subject = message.Subject;
            mimeMessage.Body = new BodyBuilder
            {
                TextBody = message.PlainTextBody,
                HtmlBody = message.HtmlBody
            }.ToMessageBody();

            // Each delivery owns a client: concurrent requests never share a connection.
            // The default factory keeps normal certificate verification and no protocol log.
            using var client = clientFactory.Create();
            client.Timeout = options.Smtp.TimeoutSeconds * 1000;
            await client.ConnectAsync(options.Smtp.Host.Trim(), options.Smtp.Port, socketOptions, timeout.Token);
            await client.AuthenticateAsync(options.Smtp.Username, options.Smtp.Password, timeout.Token);
            await client.SendAsync(mimeMessage, timeout.Token);

            // SMTP acceptance is the success boundary. A failed QUIT must not prompt a
            // resend of a message the server already accepted. Disposal closes the socket.
            try
            {
                await client.DisconnectAsync(true, timeout.Token);
            }
            catch (Exception)
            {
                // No provider exception or response is logged because it may contain secrets.
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            throw Failure(EmailDeliveryFailureKind.Timeout);
        }
        catch (TimeoutException)
        {
            throw Failure(EmailDeliveryFailureKind.Timeout);
        }
        catch (MailKit.Security.AuthenticationException)
        {
            throw Failure(EmailDeliveryFailureKind.Authentication);
        }
        catch (SslHandshakeException)
        {
            throw Failure(EmailDeliveryFailureKind.SecureConnection);
        }
        catch (NotSupportedException)
        {
            throw Failure(EmailDeliveryFailureKind.SecureConnection);
        }
        catch (SmtpCommandException)
        {
            throw Failure(EmailDeliveryFailureKind.Rejected);
        }
        catch (EmailDeliveryException)
        {
            throw;
        }
        catch (Exception)
        {
            throw Failure(EmailDeliveryFailureKind.Connection);
        }
    }

    private static EmailDeliveryException Failure(EmailDeliveryFailureKind kind) =>
        new("SMTP email delivery failed. Check backend configuration and retry.", failureKind: kind);
}
