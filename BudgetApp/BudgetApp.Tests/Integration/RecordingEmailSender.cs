using System.Collections.Concurrent;
using BudgetApp.Application.Email;

namespace BudgetApp.Tests.Integration;

public sealed class RecordingEmailSender : IEmailSender
{
    private readonly ConcurrentQueue<EmailMessage> messages = new();

    public IReadOnlyList<EmailMessage> Messages => messages.ToArray();

    public Task SendAsync(
        EmailMessage message,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        messages.Enqueue(message);
        return Task.CompletedTask;
    }

    public void Clear() => messages.Clear();
}
