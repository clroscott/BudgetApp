using BudgetApp.Application.Email;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Email;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Infrastructure.Email;

public sealed class EmailConfigurationTests
{
    [Theory]
    [InlineData("Host", "")]
    [InlineData("Host", "smtp://smtp.gmail.com")]
    [InlineData("Port", "0")]
    [InlineData("Port", "65536")]
    [InlineData("Username", "")]
    [InlineData("Password", "")]
    [InlineData("TimeoutSeconds", "0")]
    [InlineData("TimeoutSeconds", "121")]
    [InlineData("Security", "None")]
    [InlineData("Security", "Auto")]
    [InlineData("Security", "StartTlsWhenAvailable")]
    public void SmtpMode_InvalidSettingsFailAtRegistration(string setting, string value)
    {
        var options = BindOptions(new Dictionary<string, string?> { [$"Email:Smtp:{setting}"] = value });

        var failure = Assert.Throws<InvalidOperationException>(() => Register(options));

        Assert.DoesNotContain("confidential-app-password", failure.ToString());
    }

    [Theory]
    [InlineData("sender@example.test")]
    [InlineData("first@example.com, second@example.com")]
    [InlineData("not-an-address")]
    public void SmtpMode_RejectsPlaceholderAndInvalidSenders(string address)
    {
        var options = BindOptions(new Dictionary<string, string?> { ["Email:SenderAddress"] = address });

        Assert.Throws<InvalidOperationException>(() => Register(options));
    }

    [Theory]
    [InlineData("StartTls")]
    [InlineData("SslOnConnect")]
    public void SmtpMode_IsAvailableOutsideDevelopment(string security)
    {
        var services = Register(BindOptions(new Dictionary<string, string?> { ["Email:Smtp:Security"] = security }));
        using var provider = services.BuildServiceProvider();

        Assert.IsType<SmtpEmailSender>(provider.GetRequiredService<IEmailSender>());
    }

    [Fact]
    public async Task DisabledMode_DoesNotClaimAnEmailWasDelivered()
    {
        using var provider = Register(new EmailOptions()).BuildServiceProvider();
        var result = await provider.GetRequiredService<EmailDispatchService>().SendAsync(new EmailMessage(
            "recipient@example.com", "Subject", "Text", "<p>Text</p>", EmailPurpose.Informational));

        Assert.False(result.Succeeded);
    }

    [Fact]
    public void FileMode_RemainsAvailableInDevelopment()
    {
        using var provider = Register(new EmailOptions { DeliveryMode = EmailOptions.FileMode }, true).BuildServiceProvider();

        Assert.IsType<FileEmailSender>(provider.GetRequiredService<IEmailSender>());
    }

    private static ServiceCollection Register(EmailOptions options, bool development = false)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused", options, new ApplicationUrlOptions(), development);
        return services;
    }

    private static EmailOptions BindOptions(Dictionary<string, string?> overrides)
    {
        var values = new Dictionary<string, string?>
        {
            ["Email:DeliveryMode"] = "Smtp",
            ["Email:SenderAddress"] = "sender@gmail.com",
            ["Email:Smtp:Host"] = "smtp.gmail.com",
            ["Email:Smtp:Port"] = "587",
            ["Email:Smtp:Username"] = "sender@gmail.com",
            ["Email:Smtp:Password"] = "confidential-app-password"
        };
        foreach (var item in overrides)
        {
            values[item.Key] = item.Value;
        }
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build().GetSection("Email").Get<EmailOptions>()!;
    }
}
