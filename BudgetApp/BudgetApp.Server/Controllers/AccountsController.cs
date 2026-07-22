using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Accounts;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/accounts")]
public sealed class AccountsController(
    AccountManagementService accountManagementService,
    ILogger<AccountsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AccountListItem>>> List(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(await accountManagementService.ListAsync(
                householdId,
                userId,
                cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return Forbidden(exception);
        }
    }

    [HttpPost]
    public async Task<ActionResult<CreateAccountResponse>> Create(
        Guid householdId,
        CreateAccountRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var accountId = await accountManagementService.CreateAsync(
                householdId,
                userId,
                request.Name,
                request.Type,
                request.Scope,
                request.Currency,
                request.InstitutionName,
                request.LastFourDigits,
                cancellationToken);
            logger.LogInformation(
                "User {UserId} created account {AccountId} in household {HouseholdId}",
                userId,
                accountId,
                householdId);

            return Created(
                $"/api/households/{householdId}/accounts",
                new CreateAccountResponse(accountId));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPut("{accountId:guid}")]
    public async Task<IActionResult> Update(
        Guid householdId,
        Guid accountId,
        UpdateAccountRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await accountManagementService.UpdateAsync(
                householdId,
                userId,
                accountId,
                request.Name,
                request.Type,
                request.Scope,
                request.Currency,
                request.InstitutionName,
                request.LastFourDigits,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{accountId:guid}/archive")]
    public Task<IActionResult> Archive(
        Guid householdId,
        Guid accountId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, accountId, isActive: false, cancellationToken);

    [HttpPost("{accountId:guid}/reactivate")]
    public Task<IActionResult> Reactivate(
        Guid householdId,
        Guid accountId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, accountId, isActive: true, cancellationToken);

    private async Task<IActionResult> SetActive(
        Guid householdId,
        Guid accountId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await accountManagementService.SetActiveAsync(
                householdId,
                userId,
                accountId,
                isActive,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static bool IsExpected(Exception exception) =>
        exception is HouseholdAccessDeniedException or
            AccountNotFoundException or
            ArgumentException or
            InvalidOperationException;

    private ObjectResult MapException(Exception exception)
    {
        var (status, title) = exception switch
        {
            HouseholdAccessDeniedException =>
                (StatusCodes.Status403Forbidden, "Household access denied"),
            AccountNotFoundException =>
                (StatusCodes.Status404NotFound, "Account not found"),
            _ => (StatusCodes.Status400BadRequest, "Account change was rejected")
        };

        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = exception.Message
        });
    }

    private ObjectResult Forbidden(Exception exception) =>
        StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails
        {
            Status = StatusCodes.Status403Forbidden,
            Title = "Household access denied",
            Detail = exception.Message
        });
}

public sealed record CreateAccountRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name,
    [param: Required] string Type,
    [param: Required] string Scope,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency,
    [param: StringLength(100)] string? InstitutionName,
    [param: StringLength(4, MinimumLength = 4)] string? LastFourDigits);

public sealed record UpdateAccountRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name,
    [param: Required] string Type,
    [param: Required] string Scope,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency,
    [param: StringLength(100)] string? InstitutionName,
    [param: StringLength(4, MinimumLength = 4)] string? LastFourDigits);

public sealed record CreateAccountResponse(Guid Id);
