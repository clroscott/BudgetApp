using BudgetApp.Application.Authentication;
using BudgetApp.Application.Email;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;

namespace BudgetApp.Infrastructure.Identity;

public sealed class PasswordRecoveryService(
    UserManager<ApplicationUser> userManager,
    EmailTemplateFactory emailTemplateFactory,
    EmailDispatchService emailDispatchService,
    TimeProvider timeProvider,
    ILogger<PasswordRecoveryService> logger) : IPasswordRecoveryService
{
    public static readonly TimeSpan TokenLifespan = TimeSpan.FromHours(1);

    public async Task RequestPasswordResetAsync(
        string email,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        var user = await userManager.FindByEmailAsync(email.Trim());
        if (user is null || string.IsNullOrWhiteSpace(user.Email))
        {
            logger.LogInformation(
                "Password recovery request completed without a matching account");
            return;
        }

        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var message = emailTemplateFactory.CreatePasswordRecovery(
            user.Email,
            user.Id,
            token,
            timeProvider.GetUtcNow().Add(TokenLifespan));
        var delivery = await emailDispatchService.SendAsync(
            message,
            cancellationToken);

        if (!delivery.Succeeded)
        {
            logger.LogWarning(
                "Password recovery email delivery failed for user {UserId}; the request can be retried",
                user.Id);
        }
    }

    public async Task<PasswordResetResult> ResetPasswordAsync(
        Guid userId,
        string token,
        string newPassword,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(token);
        ArgumentException.ThrowIfNullOrWhiteSpace(newPassword);

        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return InvalidTokenResult();
        }

        var result = await userManager.ResetPasswordAsync(
            user,
            token,
            newPassword);

        if (!result.Succeeded)
        {
            var errors = result.Errors
                .GroupBy(error => error.Code)
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(error =>
                        error.Code.Equals(
                            "InvalidToken",
                            StringComparison.OrdinalIgnoreCase)
                            ? "The password reset link is invalid, expired, or has already been used."
                            : error.Description).ToArray());

            logger.LogWarning(
                "Password reset was rejected for user {UserId}",
                user.Id);
            return PasswordResetResult.Failure(errors);
        }

        logger.LogInformation(
            "Password was reset for user {UserId}",
            user.Id);
        return PasswordResetResult.Success();
    }

    private static PasswordResetResult InvalidTokenResult() =>
        PasswordResetResult.Failure(
            new Dictionary<string, string[]>
            {
                ["InvalidToken"] =
                [
                    "The password reset link is invalid, expired, or has already been used."
                ]
            });
}
