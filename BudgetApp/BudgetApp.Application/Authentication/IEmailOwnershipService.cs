namespace BudgetApp.Application.Authentication;

public interface IEmailOwnershipService
{
    Task RequestConfirmationAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<bool> ConfirmAsync(Guid callerId, Guid userId, string token, bool changeEmail,
        CancellationToken cancellationToken = default);
    Task<bool> RequestEmailChangeAsync(Guid userId, string newEmail, string currentPassword,
        CancellationToken cancellationToken = default);
    Task<PendingEmailChange?> GetPendingEmailChangeAsync(Guid userId,
        CancellationToken cancellationToken = default);
}

public sealed record PendingEmailChange(string Email, DateTimeOffset RequestedAtUtc,
    DateTimeOffset ExpiresAtUtc, bool IsExpired);
