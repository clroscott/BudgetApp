using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Authentication;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Server.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BudgetApp.Server.Controllers;

[ApiController]
[Route("api/auth/verification")]
[Authorize]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class LoginVerificationController(UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signIn, LoginVerificationService verification) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("pending")]
    public async Task<IActionResult> Pending(CancellationToken ct)
    {
        var session = await LoginVerificationSession.Read(HttpContext);
        var pending = session is null ? null : await verification.PendingAsync(session.Value.UserId,
            session.Value.ChallengeId, VerificationPurpose.Login, ct);
        if (pending is null) await HttpContext.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
        return Ok(new { challenge = pending });
    }
    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("authentication")]
    public async Task<IActionResult> CompleteLogin(VerifyLoginRequest request, CancellationToken ct)
    {
        var session = await LoginVerificationSession.Read(HttpContext);
        if (session is null || session.Value.ChallengeId != request.ChallengeId) return Failure();
        try
        {
            var user = await verification.CompleteLoginAsync(session.Value.UserId,
                new(request.ChallengeId, request.Code, request.UseRecoveryCode), ct);
            await HttpContext.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
            await signIn.SignInWithClaimsAsync(user, session.Value.Remember, [new Claim("amr", "mfa")]);
            return Ok(AuthController.ToResponse(user));
        }
        catch (VerificationException error) { return Failure(error); }
    }
    [AllowAnonymous]
    [HttpPost("resend-login")]
    [EnableRateLimiting("authentication")]
    public async Task<IActionResult> ResendLogin(ChallengeIdRequest request, CancellationToken ct)
    {
        var session = await LoginVerificationSession.Read(HttpContext);
        if (session is null || session.Value.ChallengeId != request.ChallengeId) return Failure();
        try { return Ok(await verification.ResendAsync(session.Value.UserId, request.ChallengeId, VerificationPurpose.Login, ct)); }
        catch (VerificationException error) { return Failure(error); }
    }
    [AllowAnonymous]
    [HttpPost("cancel-login")]
    public async Task<IActionResult> CancelLogin(CancellationToken ct)
    {
        var session = await LoginVerificationSession.Read(HttpContext);
        if (session is not null) await verification.CancelLoginAsync(session.Value.UserId, session.Value.ChallengeId, ct);
        await HttpContext.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
        return NoContent();
    }
    [HttpPost("challenge")]
    [EnableRateLimiting("authentication")]
    public async Task<IActionResult> Challenge(SecurityChallengeRequest request, CancellationToken ct)
    {
        if (!Enum.TryParse<VerificationPurpose>(request.Purpose, out var purpose) || purpose == VerificationPurpose.Login ||
            !Enum.IsDefined(purpose)) return Failure();
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var result = await signIn.CheckPasswordSignInAsync(user, request.CurrentPassword, true);
        if (!result.Succeeded) return Failure();
        try { return Ok(await verification.BeginAsync(user.Id, purpose, user.SecurityStamp!, ct)); }
        catch (VerificationException error) { return Failure(error); }
    }
    [HttpPost("resend")]
    [EnableRateLimiting("authentication")]
    public async Task<IActionResult> Resend(SecurityResendRequest request, CancellationToken ct)
    {
        if (!Enum.TryParse<VerificationPurpose>(request.Purpose, out var purpose) || purpose == VerificationPurpose.Login ||
            !Enum.IsDefined(purpose)) return Failure();
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        try { return Ok(await verification.ResendAsync(user.Id, request.ChallengeId, purpose, ct)); }
        catch (VerificationException error) { return Failure(error); }
    }
    [HttpPost("enable")]
    [EnableRateLimiting("authentication")]
    public Task<IActionResult> Enable(ManageVerificationRequest request, CancellationToken ct) => Manage(VerificationPurpose.Enable, request, ct);
    [HttpPost("disable")]
    [EnableRateLimiting("authentication")]
    public Task<IActionResult> Disable(ManageVerificationRequest request, CancellationToken ct) => Manage(VerificationPurpose.Disable, request, ct);
    [HttpPost("recovery-codes")]
    [EnableRateLimiting("authentication")]
    public Task<IActionResult> RecoveryCodes(ManageVerificationRequest request, CancellationToken ct) => Manage(VerificationPurpose.RecoveryCodes, request, ct);
    private async Task<IActionResult> Manage(VerificationPurpose purpose, ManageVerificationRequest request, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        try
        {
            var result = await verification.ManageAsync(user.Id, purpose, request.CurrentPassword, request.Proof, null, ct);
            var session = await HttpContext.AuthenticateAsync(IdentityConstants.ApplicationScheme);
            await signIn.SignInWithClaimsAsync(result.User, session.Properties?.IsPersistent == true, [new Claim("amr", "mfa")]);
            return Ok(new { user = AuthController.ToResponse(result.User), recoveryCodes = result.Codes,
                verification = await verification.StatusAsync(result.User, ct) });
        }
        catch (VerificationException error) { return Failure(error); }
    }
    private ObjectResult Failure(VerificationException? error = null) => Problem(
        statusCode: error?.RateLimited == true ? 429 : 400, title: "Verification unavailable",
        detail: error?.Message ?? "This verification session is unavailable. Sign in again to start a new challenge.");
}
public sealed record VerifyLoginRequest(Guid ChallengeId, [param: Required, StringLength(100)] string Code, bool UseRecoveryCode = false);
public sealed record ChallengeIdRequest(Guid ChallengeId);
public sealed record SecurityChallengeRequest([param: Required, StringLength(50)] string Purpose,
    [param: Required, StringLength(128)] string CurrentPassword);
public sealed record SecurityResendRequest(Guid ChallengeId, [param: Required, StringLength(50)] string Purpose);
public sealed record ManageVerificationRequest([param: Required, StringLength(128)] string CurrentPassword,
    [param: Required] VerificationProof Proof);
