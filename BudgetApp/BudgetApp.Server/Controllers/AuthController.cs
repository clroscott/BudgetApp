using System.ComponentModel.DataAnnotations;
using BudgetApp.Application.Authentication;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BudgetApp.Server.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    IPasswordRecoveryService passwordRecoveryService,
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
    public async Task<ActionResult<CurrentUserResponse>> Register(
        RegisterRequest request)
    {
        var email = request.Email.Trim();
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            DisplayName = request.DisplayName.Trim()
        };

        var result = await userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
        {
            return IdentityValidationProblem(result);
        }

        await signInManager.SignInAsync(user, isPersistent: false);
        logger.LogInformation("Registered and signed in user {UserId}", user.Id);

        return Ok(ToResponse(user));
    }

    [AllowAnonymous]
    [EnableRateLimiting("authentication")]
    [HttpPost("login")]
    public async Task<ActionResult<CurrentUserResponse>> Login(LoginRequest request)
    {
        var email = request.Email.Trim();
        var result = await signInManager.PasswordSignInAsync(
            email,
            request.Password,
            request.RememberMe,
            lockoutOnFailure: true);

        if (!result.Succeeded)
        {
            return Unauthorized(new ProblemDetails
            {
                Status = StatusCodes.Status401Unauthorized,
                Title = "Unable to sign in",
                Detail = "The email address or password is incorrect."
            });
        }

        var user = await userManager.FindByEmailAsync(email);

        if (user is null)
        {
            logger.LogError("Identity sign-in succeeded but the user could not be loaded");
            await signInManager.SignOutAsync();
            return Problem(statusCode: StatusCodes.Status500InternalServerError);
        }

        logger.LogInformation("Signed in user {UserId}", user.Id);
        return Ok(ToResponse(user));
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
        return user is null ? Unauthorized() : Ok(ToResponse(user));
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await userManager.GetUserAsync(User);

        if (user is null)
        {
            return Unauthorized();
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

    private static CurrentUserResponse ToResponse(ApplicationUser user) =>
        new(user.Id, user.Email!, user.DisplayName);
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
    [param: Required, StringLength(128, MinimumLength = 12)] string NewPassword);

public sealed record CurrentUserResponse(
    Guid Id,
    string Email,
    string DisplayName);
