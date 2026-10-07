using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authentication;
using BudgetApp.Application.Authentication;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Infrastructure.Administration;
using BudgetApp.Server.Security;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Server.Controllers;

[ApiController]
[Route("api/auth")]
[AllowUnverifiedEmail]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class AuthController(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    IPasswordRecoveryService passwordRecoveryService,
    IEmailOwnershipService emailOwnershipService,
    LoginVerificationService verification,
    ApplicationAdministratorAccess administrators,
    ILogger<AuthController> logger) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("antiforgery")]
    [ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
    public ActionResult<AntiforgeryResponse> GetAntiforgeryToken(
        [FromServices] IAntiforgery antiforgery)
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);

        return Ok(new AntiforgeryResponse(tokens.RequestToken!));
    }

    [AllowAnonymous]
    [EnableRateLimiting("authentication")]
    [HttpPost("register")]
    public async Task<ActionResult<EmailRequestedResponse>> Register(
        RegisterRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            DisplayName = request.DisplayName.Trim()
        };

        try
        {
            var result = await userManager.CreateAsync(user, request.Password);
            if (result.Succeeded)
            {
                await emailOwnershipService.RequestConfirmationAsync(user.Id, cancellationToken);
                logger.LogInformation("Registered user {UserId}; email confirmation requested", user.Id);
            }
            else if (result.Errors.Any(error => error.Code is not "DuplicateEmail" and not "DuplicateUserName"))
            {
                return IdentityValidationProblem(result);
            }
        }
        catch (DbUpdateException)
        {
            // Concurrent duplicate registration has the same response as an existing address.
            logger.LogWarning("Registration could not be completed due to an account write conflict");
        }
        return Accepted(new EmailRequestedResponse(
            "If registration can be completed for that address, a confirmation link has been requested. If you already have an account, sign in or reset your password."));
    }

    [AllowAnonymous]
    [EnableRateLimiting("authentication")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        // A password-only step never creates a full session for an enrolled account.
        if (User.Identity?.IsAuthenticated == true) await signInManager.SignOutAsync();
        else await HttpContext.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
        var user = await userManager.FindByEmailAsync(email);
        var result = user is null ? Microsoft.AspNetCore.Identity.SignInResult.Failed : await signInManager.CheckPasswordSignInAsync(
            user, request.Password, lockoutOnFailure: true);

        if (!result.Succeeded)
        {
            return Unauthorized(new ProblemDetails
            {
                Status = StatusCodes.Status401Unauthorized,
                Title = "Unable to sign in",
                Detail = "The email address or password is incorrect."
            });
        }

        if (user is null)
        {
            logger.LogError("Identity sign-in succeeded but the user could not be loaded");
            await signInManager.SignOutAsync();
            return Problem(statusCode: StatusCodes.Status500InternalServerError);
        }

        if (user.TwoFactorEnabled)
        {
            try
            {
                var challenge = await verification.BeginAsync(user.Id, VerificationPurpose.Login, user.SecurityStamp!, cancellationToken);
                await LoginVerificationSession.Start(HttpContext, user.Id, request.RememberMe, challenge);
                return Ok(new { requiresVerification = true, challenge });
            }
            catch (VerificationException error)
            {
                return Problem(statusCode: error.RateLimited ? 429 : 400, title: "Verification unavailable", detail: error.Message);
            }
        }
        await signInManager.SignInAsync(user, request.RememberMe);
        logger.LogInformation("Signed in user {UserId}", user.Id);
        return Ok(await UserResponse(user));
    }

    [AllowAnonymous]
    [EnableRateLimiting("authentication")]
    [HttpPost("forgot-password")]
    public async Task<ActionResult<PasswordRecoveryRequestedResponse>>
        ForgotPassword(
            ForgotPasswordRequest request,
            CancellationToken cancellationToken)
    {
        await passwordRecoveryService.RequestPasswordResetAsync(
            request.Email,
            cancellationToken);

        return Accepted(new PasswordRecoveryRequestedResponse(
            "If an account exists for that email address, password recovery instructions have been generated."));
    }

    [AllowAnonymous]
    [EnableRateLimiting("authentication")]
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(
        ResetPasswordRequest request,
        CancellationToken cancellationToken)
    {
        var result = request.UserId == Guid.Empty
            ? PasswordResetResult.Failure(
                new Dictionary<string, string[]>
                {
                    ["InvalidToken"] =
                    [
                        "The password reset link is invalid, expired, or has already been used."
                    ]
                })
            : await passwordRecoveryService.ResetPasswordAsync(
                request.UserId,
                request.Token,
                request.NewPassword,
                cancellationToken);

        if (!result.Succeeded)
        {
            return ValidationProblem(
                new ValidationProblemDetails(
                    result.Errors.ToDictionary(
                        item => item.Key,
                        item => item.Value)));
        }

        await signInManager.SignOutAsync();
        return NoContent();
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var userId = userManager.GetUserId(User);
        await signInManager.SignOutAsync();
        logger.LogInformation("Signed out user {UserId}", userId);

        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserResponse>> GetCurrentUser()
    {
        var user = await userManager.GetUserAsync(User);
        return user is null ? Unauthorized() : Ok(await UserResponse(user));
    }

    [Authorize]
    [HttpGet("settings")]
    public async Task<ActionResult<AccountSettingsResponse>> GetSettings(CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        return user is null ? Unauthorized() : Ok(await SettingsResponse(user, cancellationToken));
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<ActionResult<AccountSettingsResponse>> UpdateProfile(
        UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var name = request.DisplayName.Trim();
        if (name.Length == 0)
        {
            ModelState.AddModelError(nameof(request.DisplayName), "Enter a display name.");
            return ValidationProblem(ModelState);
        }
        if (request.Version != user.ConcurrencyStamp) return ProfileConflict();
        user.DisplayName = name;
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(error => error.Code == "ConcurrencyFailure")) return ProfileConflict();
            return IdentityValidationProblem(result);
        }
        await signInManager.RefreshSignInAsync(user);
        logger.LogInformation("Updated display name for user {UserId}", user.Id);
        return Ok(await SettingsResponse(user, cancellationToken));
    }

    private ActionResult ProfileConflict() => Conflict(new ProblemDetails
    {
        Status = StatusCodes.Status409Conflict,
        Title = "Account settings changed",
        Detail = "Your account settings changed elsewhere. Your entered name is kept; reload the current settings before saving again."
    });

    private async Task<AccountSettingsResponse> SettingsResponse(ApplicationUser user, CancellationToken cancellationToken) =>
        new(await UserResponse(user), await emailOwnershipService.GetPendingEmailChangeAsync(user.Id, cancellationToken),
            user.ConcurrencyStamp!, await verification.StatusAsync(user, cancellationToken));

    [Authorize]
    [EnableRateLimiting("emailOwnership")]
    [HttpPost("resend-confirmation")]
    public async Task<ActionResult<EmailRequestedResponse>> ResendConfirmation(CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        await emailOwnershipService.RequestConfirmationAsync(user.Id, cancellationToken);
        return Accepted(ConfirmationRequested());
    }

    [Authorize]
    [EnableRateLimiting("emailOwnership")]
    [HttpPost("request-email-change")]
    public async Task<ActionResult<EmailRequestedResponse>> RequestEmailChange(
        RequestEmailChangeRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        bool requested;
        try { requested = await emailOwnershipService.RequestEmailChangeAsync(user.Id, request.NewEmail,
                request.CurrentPassword, cancellationToken, request.Proof); }
        catch (VerificationException error) { return Problem(statusCode: error.RateLimited ? 429 : 400, title: "Verification unavailable", detail: error.Message); }
        if (!requested)
            return Problem(statusCode: StatusCodes.Status400BadRequest,
                title: "Email change not requested", detail: "Check your current password and the email address, then try again.");
        return Accepted(ConfirmationRequested());
    }

    [Authorize]
    [EnableRateLimiting("emailOwnership")]
    [HttpPost("confirm-email")]
    public Task<ActionResult<CurrentUserResponse>> ConfirmEmail(
        ConfirmEmailRequest request, CancellationToken cancellationToken) =>
        ConfirmEmail(request, false, cancellationToken);

    [Authorize]
    [EnableRateLimiting("emailOwnership")]
    [HttpPost("confirm-email-change")]
    public Task<ActionResult<CurrentUserResponse>> ConfirmEmailChange(
        ConfirmEmailRequest request, CancellationToken cancellationToken) =>
        ConfirmEmail(request, true, cancellationToken);

    private async Task<ActionResult<CurrentUserResponse>> ConfirmEmail(
        ConfirmEmailRequest request, bool changeEmail, CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!await emailOwnershipService.ConfirmAsync(user.Id, request.UserId, request.Token,
                changeEmail, cancellationToken))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Confirmation unavailable",
                detail: "This link is invalid, expired, replaced, already used, or belongs to another account. Sign in to the account that requested it or request a new link.");
        // The service updates this scoped Identity entity within its transaction.
        await signInManager.RefreshSignInAsync(user);
        return Ok(await UserResponse(user));
    }

    private static EmailRequestedResponse ConfirmationRequested() => new(
        "If the address can be confirmed, a confirmation link has been requested. Check your inbox and spam folder. Wait at least one minute before requesting another link. If no email arrives, retry or contact the person who manages this installation.");

    [Authorize]
    [EnableRateLimiting("emailOwnership")]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);

        if (user is null)
        {
            return Unauthorized();
        }

        if (user.TwoFactorEnabled)
        {
            try
            {
                await verification.ManageAsync(user.Id, VerificationPurpose.ChangePassword, request.CurrentPassword,
                    request.Proof ?? new(Guid.Empty, ""), request.NewPassword, cancellationToken);
                await signInManager.RefreshSignInAsync(user);
                return NoContent();
            }
            catch (VerificationException error) { return Problem(statusCode: error.RateLimited ? 429 : 400, title: "Verification unavailable", detail: error.Message); }
        }
        var result = await userManager.ChangePasswordAsync(
            user,
            request.CurrentPassword,
            request.NewPassword);

        if (!result.Succeeded)
        {
            return IdentityValidationProblem(result);
        }

        await signInManager.RefreshSignInAsync(user);
        logger.LogInformation("Changed password for user {UserId}", user.Id);

        return NoContent();
    }

    private ActionResult IdentityValidationProblem(IdentityResult result)
    {
        var errors = result.Errors
            .GroupBy(error => error.Code)
            .ToDictionary(
                group => group.Key,
                group => group.Select(error => error.Description).ToArray());

        return ValidationProblem(new ValidationProblemDetails(errors));
    }

    private async Task<CurrentUserResponse> UserResponse(ApplicationUser user) => ToResponse(user,
        await administrators.IsDesignatedAsync(user.Id), await administrators.IsOwnerAsync(user.Id));
    internal static CurrentUserResponse ToResponse(ApplicationUser user, bool isApplicationAdministrator = false, bool isApplicationOwner = false) =>
        new(user.Id, user.Email!, user.DisplayName, user.EmailConfirmed, user.TwoFactorEnabled, isApplicationAdministrator, isApplicationOwner);
}

public sealed record AntiforgeryResponse(string Token);

public sealed record RegisterRequest(
    [param: Required, EmailAddress, StringLength(256)] string Email,
    [param: Required, StringLength(128, MinimumLength = 12)] string Password,
    [param: Required, StringLength(100, MinimumLength = 1)] string DisplayName);

public sealed record LoginRequest(
    [param: Required, EmailAddress, StringLength(256)] string Email,
    [param: Required, StringLength(128)] string Password,
    bool RememberMe = false);

public sealed record ForgotPasswordRequest(
    [param: Required, EmailAddress, StringLength(256)] string Email);

public sealed record ResetPasswordRequest(
    Guid UserId,
    [param: Required, StringLength(4096)] string Token,
    [param: Required, StringLength(128, MinimumLength = 12)] string NewPassword);

public sealed record PasswordRecoveryRequestedResponse(string Message);

public sealed record ChangePasswordRequest(
    [param: Required, StringLength(128)] string CurrentPassword,
    [param: Required, StringLength(128, MinimumLength = 12)] string NewPassword, VerificationProof? Proof = null);

public sealed record CurrentUserResponse(
    Guid Id,
    string Email,
    string DisplayName,
    bool EmailConfirmed, bool LoginVerificationEnabled, bool IsApplicationAdministrator, bool IsApplicationOwner = false);

public sealed record EmailRequestedResponse(string Message);
public sealed record ConfirmEmailRequest(Guid UserId,
    [param: Required, StringLength(4096)] string Token);
public sealed record RequestEmailChangeRequest(
    [param: Required, EmailAddress, StringLength(256)] string NewEmail,
    [param: Required, StringLength(128)] string CurrentPassword, VerificationProof? Proof = null);

public sealed record AccountSettingsResponse(CurrentUserResponse User, PendingEmailChange? PendingEmailChange, string Version,
    LoginVerificationStatus Verification);
public sealed record UpdateProfileRequest(
    [param: Required, StringLength(100)] string DisplayName,
    [param: Required, StringLength(100)] string Version);
