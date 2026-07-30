namespace BudgetApp.Application.Authentication;

public interface IPasswordRecoveryService
{
    Task RequestPasswordResetAsync(
        string email,
        CancellationToken cancellationToken = default);

    Task<PasswordResetResult> ResetPasswordAsync(
        Guid userId,
        string token,
        string newPassword,
        CancellationToken cancellationToken = default);
}

public sealed record PasswordResetResult(
    bool Succeeded,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public static PasswordResetResult Success() =>
        new(true, new Dictionary<string, string[]>());

    public static PasswordResetResult Failure(
        IReadOnlyDictionary<string, string[]> errors) =>
        new(false, errors);
}
