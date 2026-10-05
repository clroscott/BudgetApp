using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using MimeKit;

namespace BudgetApp.Tests.Infrastructure.Email;

// A real local SMTP exchange: no external provider, account, or test mail is used.
internal sealed class LoopbackSmtpServer : IAsyncDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource shutdown = new(TimeSpan.FromSeconds(15));
    private readonly bool advertiseTls;
    private readonly bool rejectAuthentication;
    private readonly bool rejectRecipient;
    private readonly bool stall;
    private readonly Task exchange;

    public LoopbackSmtpServer(
        bool advertiseTls = true,
        bool rejectAuthentication = false,
        bool rejectRecipient = false,
        bool stall = false)
    {
        this.advertiseTls = advertiseTls;
        this.rejectAuthentication = rejectAuthentication;
        this.rejectRecipient = rejectRecipient;
        this.stall = stall;
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder();
        names.AddDnsName("localhost");
        names.AddIpAddress(IPAddress.Loopback);
        request.CertificateExtensions.Add(names.Build());
        using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
        Certificate = X509CertificateLoader.LoadPkcs12(generated.Export(X509ContentType.Pfx), null);
        listener.Start();
        Port = ((IPEndPoint)listener.LocalEndpoint).Port;
        exchange = RunAsync();
    }

    public int Port { get; }
    public X509Certificate2 Certificate { get; }
    public bool UsedTls { get; private set; }
    public string? AuthenticationPayload { get; private set; }
    public MimeMessage? Message { get; private set; }

    public Task CompleteAsync() => exchange;

    private async Task RunAsync()
    {
        using var socket = await listener.AcceptTcpClientAsync(shutdown.Token);
        Stream stream = socket.GetStream();
        SslStream? secureStream = null;
        var reader = CreateReader(stream);
        var writer = CreateWriter(stream);
        try
        {
            if (stall)
            {
                await Task.Delay(Timeout.Infinite, shutdown.Token);
                return;
            }

            await writer.WriteLineAsync("220 localhost test SMTP");
            while (await reader.ReadLineAsync(shutdown.Token) is { } command)
            {
                if (command.StartsWith("EHLO", StringComparison.Ordinal))
                {
                    await writer.WriteLineAsync("250-localhost");
                    if (!UsedTls && advertiseTls)
                    {
                        await writer.WriteLineAsync("250-STARTTLS");
                    }
                    if (UsedTls)
                    {
                        await writer.WriteLineAsync("250-AUTH PLAIN");
                    }
                    await writer.WriteLineAsync("250 SIZE 1048576");
                }
                else if (command == "STARTTLS")
                {
                    await writer.WriteLineAsync("220 Ready for TLS");
                    reader.Dispose();
                    writer.Dispose();
                    secureStream = new SslStream(stream, leaveInnerStreamOpen: true);
                    await secureStream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
                    {
                        ServerCertificate = Certificate,
                        EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13
                    }, shutdown.Token);
                    UsedTls = true;
                    reader = CreateReader(secureStream);
                    writer = CreateWriter(secureStream);
                }
                else if (command.StartsWith("AUTH PLAIN", StringComparison.Ordinal))
                {
                    if (!UsedTls)
                    {
                        throw new InvalidOperationException("Test received credentials before TLS.");
                    }
                    var encoded = command[10..].Trim();
                    if (encoded.Length == 0)
                    {
                        await writer.WriteLineAsync("334 ");
                        encoded = await reader.ReadLineAsync(shutdown.Token) ?? "";
                    }
                    AuthenticationPayload = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
                    await writer.WriteLineAsync(rejectAuthentication
                        ? "535 Authentication rejected; confidential-provider-response"
                        : "235 Authentication succeeded");
                }
                else if (command.StartsWith("MAIL FROM:", StringComparison.Ordinal))
                {
                    await writer.WriteLineAsync("250 Sender accepted");
                }
                else if (command.StartsWith("RCPT TO:", StringComparison.Ordinal))
                {
                    await writer.WriteLineAsync(rejectRecipient
                        ? "550 confidential-provider-response recipient rejected"
                        : "250 Recipient accepted");
                }
                else if (command == "DATA")
                {
                    await writer.WriteLineAsync("354 Send message");
                    var data = new StringBuilder();
                    while (await reader.ReadLineAsync(shutdown.Token) is { } line && line != ".")
                    {
                        data.Append(line.StartsWith("..", StringComparison.Ordinal) ? line[1..] : line);
                        data.Append("\r\n");
                    }
                    using var buffer = new MemoryStream(Encoding.UTF8.GetBytes(data.ToString()));
                    Message = await MimeMessage.LoadAsync(buffer, shutdown.Token);
                    await writer.WriteLineAsync("250 Message accepted");
                }
                else if (command == "QUIT")
                {
                    await writer.WriteLineAsync("221 Closing connection");
                    return;
                }
                else if (command == "RSET")
                {
                    await writer.WriteLineAsync("250 Reset");
                }
                else
                {
                    throw new InvalidOperationException("Unexpected SMTP test command.");
                }
            }
        }
        finally
        {
            reader.Dispose();
            writer.Dispose();
            secureStream?.Dispose();
        }
    }

    private static StreamReader CreateReader(Stream stream) =>
        new(stream, Encoding.UTF8, false, 1024, leaveOpen: true);

    private static StreamWriter CreateWriter(Stream stream) =>
        new(stream, new UTF8Encoding(false), 1024, leaveOpen: true) { AutoFlush = true, NewLine = "\r\n" };

    public async ValueTask DisposeAsync()
    {
        shutdown.Cancel();
        listener.Stop();
        try
        {
            await exchange;
        }
        catch (Exception exception) when (exception is OperationCanceledException or IOException or AuthenticationException or SocketException)
        {
            // Expected when the client refuses TLS, cancels, or disconnects early.
        }
        Certificate.Dispose();
        shutdown.Dispose();
    }
}
