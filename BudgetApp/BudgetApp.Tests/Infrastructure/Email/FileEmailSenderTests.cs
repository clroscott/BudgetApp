using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Email;
using Microsoft.Extensions.Logging.Abstractions;

namespace BudgetApp.Tests.Infrastructure.Email;

public sealed class FileEmailSenderTests
{
    [Theory]
    [InlineData(EmailPurpose.Informational, "informational")]
    [InlineData(EmailPurpose.EmailConfirmation, "email-confirmation")]
    [InlineData(EmailPurpose.EmailChange, "email-change")]
    public async Task SendAsync_WritesReadableTextAndEmlFiles(EmailPurpose purpose, string slug)
    {
        var outbox = Path.Combine(
            Path.GetTempPath(),
            "BudgetApp.Tests",
            Guid.NewGuid().ToString("N"));
        var sender = new FileEmailSender(
            new EmailOptions
            {
                DeliveryMode = EmailOptions.FileMode,
                SenderName = "MC Budget",
                SenderAddress = "no-reply@example.test",
                FileOutboxPath = outbox
            },
            TimeProvider.System,
            NullLogger<FileEmailSender>.Instance);
        var message = new EmailMessage(
            "person@example.test",
            "Test email",
            "Open https://budget.example/test",
            "<p>Open the test link.</p>",
            purpose);

        try
        {
            await sender.SendAsync(message);

            var textPath = Assert.Single(Directory.GetFiles(outbox, "*.txt"));
            Assert.Contains(slug, Path.GetFileName(textPath));
            var emlPath = Assert.Single(Directory.GetFiles(outbox, "*.eml"));
            var text = await File.ReadAllTextAsync(textPath);
            var eml = await File.ReadAllTextAsync(emlPath);

            Assert.Contains("DEVELOPMENT EMAIL - NOT SENT", text);
            Assert.Contains("To: person@example.test", text);
            Assert.Contains("Open https://budget.example/test", text);
            Assert.Contains("Content-Type: multipart/alternative", eml);
            Assert.Contains("X-BudgetApp-Development-Email: true", eml);
        }
        finally
        {
            var resolvedOutbox = Path.GetFullPath(outbox);
            var expectedRoot = Path.GetFullPath(
                Path.Combine(Path.GetTempPath(), "BudgetApp.Tests"));

            if (resolvedOutbox.StartsWith(
                    expectedRoot + Path.DirectorySeparatorChar,
                    StringComparison.OrdinalIgnoreCase) &&
                Directory.Exists(resolvedOutbox))
            {
                Directory.Delete(resolvedOutbox, recursive: true);
            }
        }
    }
}
