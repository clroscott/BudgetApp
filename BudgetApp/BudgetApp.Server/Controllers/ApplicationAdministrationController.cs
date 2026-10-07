using System.ComponentModel.DataAnnotations;
using BudgetApp.Infrastructure.Administration;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Server.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using BudgetApp.Infrastructure.Data;

namespace BudgetApp.Server.Controllers;

[ApiController, Route("api/admin"), Authorize(Policy = "ApplicationAdministrator")]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class ApplicationAdministrationController(ApplicationAdministrationService administration,
    UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, BudgetAppDbContext db) : ControllerBase
{
    [HttpGet("users")]
    public async Task<IActionResult> Users(string? search, int page = 1, CancellationToken ct = default) => await Run(async () => {
        var result = await administration.UsersAsync(search, page, ct);
        return Ok(new { result.Items, result.TotalCount, page, pageSize = 20 });
    });
    [HttpGet("accounts")]
    public async Task<IActionResult> Search(string? search, CancellationToken ct) =>
        await Run(async () => Ok(new { items = await administration.SearchAsync(search, ct) }));
    [HttpGet("accounts/{id:guid}")]
    public async Task<IActionResult> Account(Guid id, CancellationToken ct) => await Run(async () => Ok(await administration.GetAccountAsync(id, ct)));
    [HttpGet("administrators"), Authorize(Policy = "ApplicationOwner")]
    public async Task<IActionResult> Administrators(int page = 1, CancellationToken ct = default) => await Run(async () => {
        var result = await administration.AdministratorsAsync(page, ct);
        return Ok(new { result.Items, result.TotalCount, page, pageSize = 20 });
    });
    [HttpGet("audit")]
    public async Task<IActionResult> Audit(Guid? targetUserId, int page = 1, CancellationToken ct = default) => await Run(async () => {
        var result = await administration.AuditAsync(targetUserId, page, ct);
        return Ok(new { result.Items, result.TotalCount, page, pageSize = 20 });
    });
    [HttpGet("actions/{id:guid}")]
    public async Task<IActionResult> Result(Guid id, CancellationToken ct)
    {
        var audit = await db.AdministrativeAuditEvents.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        return audit is null ? NotFound() : Ok(ApplicationAdministrationService.Result(audit));
    }
    [HttpPost("actions/prepare"), EnableRateLimiting("authentication")]
    public async Task<IActionResult> Prepare(AdministrativeActionRequest request, CancellationToken ct) => await Run(async () => {
        var user = await CheckedPassword(request.CurrentPassword);
        return Ok(await administration.PrepareAsync(user, request, ct));
    });
    [HttpPost("actions/resend"), EnableRateLimiting("authentication")]
    public async Task<IActionResult> Resend(ResendAdministrativeCodeRequest request, CancellationToken ct) => await Run(async () => {
        var user = await CheckedPassword(request.Request.CurrentPassword);
        return Ok(await administration.ResendAsync(user.Id, request.Request, request.ChallengeId, ct));
    });
    [HttpPost("actions/complete"), EnableRateLimiting("authentication")]
    public async Task<IActionResult> Complete(CompleteAdministrativeActionRequest request, CancellationToken ct) => await Run(async () => {
        var user = await CheckedPassword(request.Request.CurrentPassword);
        var result = await administration.ExecuteAsync(user.Id, user.SecurityStamp!, request.Request, request.Proof, ct);
        if (request.Request.TargetUserId == user.Id && ApplicationAdministrationService.IsGrantAction(request.Request.Action) && result.Outcome is "Succeeded" or "SucceededNoticeFailed")
        {
            await HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
            await HttpContext.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
        }
        return Ok(result);
    });
    private async Task<ApplicationUser> CheckedPassword(string password)
    {
        var user = await users.GetUserAsync(User) ?? throw new AdministrationException(401, "Sign in again.");
        if (!(await signIn.CheckPasswordSignInAsync(user, password, true)).Succeeded)
            throw new AdministrationException(400, "Check your current password. Too many attempts temporarily lock sign-in.");
        return user;
    }
    private async Task<IActionResult> Run(Func<Task<IActionResult>> operation)
    {
        try { return await operation(); }
        catch (AdministrationException error) { return Problem(statusCode: error.Status, title: "Administrative action unavailable", detail: error.Message); }
        catch (BudgetApp.Infrastructure.Identity.VerificationException error) { return Problem(statusCode: error.RateLimited ? 429 : 400, title: "MFA verification unavailable", detail: error.Message); }
    }
}

[ApiController, Route("api/auth/operator-mfa-recovery"), AllowAnonymous, AllowUnverifiedEmail]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class OperatorMfaRecoveryController(ApplicationAdministrationService administration) : ControllerBase
{
    [HttpPost, EnableRateLimiting("authentication")]
    public async Task<IActionResult> Complete(OperatorMfaRecoveryRequest request, CancellationToken ct)
    {
        try
        {
            var recoveryCodes = await administration.CompleteMfaRecoveryAsync(request.UserId, request.Token, request.CurrentPassword, ct);
            await HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
            await HttpContext.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
            return Ok(new { recoveryCodes });
        }
        catch (AdministrationException error) { return Problem(statusCode: error.Status, title: "MFA recovery unavailable", detail: error.Message); }
    }
}
public sealed record OperatorMfaRecoveryRequest(Guid UserId,
    [param: Required, StringLength(100)] string Token,
    [param: Required, StringLength(128)] string CurrentPassword);
