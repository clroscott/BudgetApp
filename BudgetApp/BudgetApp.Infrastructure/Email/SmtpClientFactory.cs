using MailKit.Net.Smtp;

namespace BudgetApp.Infrastructure.Email;

public interface ISmtpClientFactory
{
    SmtpClient Create();
}

public sealed class SmtpClientFactory : ISmtpClientFactory
{
    public SmtpClient Create() => new();
}
