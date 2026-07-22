using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Households;
using BudgetApp.Application.RecurringExpenses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/recurring-expenses")]
public sealed class RecurringExpensesController(
    RecurringExpenseManagementService managementService,
    ILogger<RecurringExpensesController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<RecurringExpenseListItem>>> List(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await managementService.ListAsync(
                householdId, userId, cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return Forbidden(exception);
        }
    }

    [HttpPost]
    public async Task<ActionResult<CreateRecurringExpenseResponse>> Create(
        Guid householdId,
        RecurringExpenseRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            var id = await managementService.CreateAsync(
                householdId, userId, request.Name, request.Amount, request.Scope,
                request.SubcategoryId, request.AccountId, request.ExpectedDayOfMonth,
                request.StartsOn, request.EndsOn, cancellationToken);
            logger.LogInformation(
                "User {UserId} created recurring expense {RecurringExpenseId} in household {HouseholdId}",
                userId, id, householdId);
            return Created(
                $"/api/households/{householdId}/recurring-expenses",
                new CreateRecurringExpenseResponse(id));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPut("{recurringExpenseId:guid}")]
    public async Task<IActionResult> Update(
        Guid householdId,
        Guid recurringExpenseId,
        RecurringExpenseRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            await managementService.UpdateAsync(
                householdId, userId, recurringExpenseId,
                request.Name, request.Amount, request.Scope,
                request.SubcategoryId, request.AccountId, request.ExpectedDayOfMonth,
                request.StartsOn, request.EndsOn, cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{recurringExpenseId:guid}/deactivate")]
    public Task<IActionResult> Deactivate(
        Guid householdId,
        Guid recurringExpenseId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, recurringExpenseId, false, cancellationToken);

    [HttpPost("{recurringExpenseId:guid}/reactivate")]
    public Task<IActionResult> Reactivate(
        Guid householdId,
        Guid recurringExpenseId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, recurringExpenseId, true, cancellationToken);

    private async Task<IActionResult> SetActive(
        Guid householdId,
        Guid recurringExpenseId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            await managementService.SetActiveAsync(
                householdId, userId, recurringExpenseId, isActive, cancellationToken);
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
            RecurringExpenseNotFoundException or
            ArgumentException or InvalidOperationException;

    private ObjectResult MapException(Exception exception)
    {
        var (status, title) = exception switch
        {
            HouseholdAccessDeniedException =>
                (StatusCodes.Status403Forbidden, "Household access denied"),
            RecurringExpenseNotFoundException =>
                (StatusCodes.Status404NotFound, "Recurring expense not found"),
            _ => (StatusCodes.Status400BadRequest, "Recurring expense change was rejected")
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

public sealed record RecurringExpenseRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name,
    [param: Range(typeof(decimal), "0.0001", "999999999999999.9999")] decimal Amount,
    [param: Required] string Scope,
    Guid SubcategoryId,
    Guid? AccountId,
    [param: Range(1, 31)] int? ExpectedDayOfMonth,
    DateOnly StartsOn,
    DateOnly? EndsOn);

public sealed record CreateRecurringExpenseResponse(Guid Id);
