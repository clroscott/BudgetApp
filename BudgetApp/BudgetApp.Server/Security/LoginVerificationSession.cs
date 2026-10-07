using System.Security.Claims;
using BudgetApp.Application.Authentication;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;

namespace BudgetApp.Server.Security;

public static class LoginVerificationSession
{
    public static async Task Start(HttpContext context, Guid userId, bool rememberMe, VerificationChallenge challenge)
    {
        var identity = new ClaimsIdentity([
            new(ClaimTypes.NameIdentifier, userId.ToString()), new("challenge", challenge.ChallengeId.ToString()),
            new("remember", rememberMe ? "true" : "false")
        ], IdentityConstants.TwoFactorUserIdScheme);
        await context.SignInAsync(IdentityConstants.TwoFactorUserIdScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = false, AllowRefresh = false,
                ExpiresUtc = DateTimeOffset.UtcNow + LoginVerificationService.ChallengeLifetime });
    }
    public static async Task<(Guid UserId, Guid ChallengeId, bool Remember)?> Read(HttpContext context)
    {
        var session = await context.AuthenticateAsync(IdentityConstants.TwoFactorUserIdScheme);
        if (!session.Succeeded || !Guid.TryParse(session.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
            !Guid.TryParse(session.Principal.FindFirstValue("challenge"), out var challengeId)) return null;
        return (userId, challengeId, session.Principal.FindFirstValue("remember") == "true");
    }
}
