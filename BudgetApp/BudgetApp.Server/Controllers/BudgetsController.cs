using System.Security.Claims;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/budgets")]
public sealed class BudgetsController(
    BudgetManagementService budgetManagementService,
    ILogger<BudgetsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BudgetMonthOption>>> ListAvailable(
        Guid householdId,
        [FromQuery] string? scope,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await budgetManagementService.ListAvailableAsync(
                householdId, userId, scope ?? "Household", cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpGet("{year:int}/{month:int}")]
    public Task<ActionResult<BudgetPageModel>> Get(
        Guid householdId, int year, int month, [FromQuery] string? scope,
        CancellationToken cancellationToken) =>
        ExecuteRead(userId => budgetManagementService.GetAsync(
            householdId, userId, year, month, scope ?? "Household", cancellationToken));

    [HttpPost("{year:int}/{month:int}")]
    public Task<ActionResult<BudgetPageModel>> Create(
        Guid householdId, int year, int month, CreateBudgetRequest request,
        CancellationToken cancellationToken) =>
        ExecuteWrite(async userId =>
        {
            var model = await budgetManagementService.CreateAsync(
                householdId, userId, year, month, request.Scope, cancellationToken);
            logger.LogInformation(
                "User {UserId} created budget {BudgetId} for household {HouseholdId}",
                userId, model.Id, householdId);
            return CreatedAtAction(nameof(Get), new { householdId, year, month, scope = request.Scope }, model);
        });

    [HttpPost("{year:int}/{month:int}/copy")]
    public Task<ActionResult<BudgetPageModel>> Copy(
        Guid householdId, int year, int month, CopyBudgetRequest request,
        CancellationToken cancellationToken) =>
        ExecuteWrite(async userId => Ok(await budgetManagementService.CopyFromAsync(
            householdId, userId, year, month, request.Scope,
            request.SourceYear, request.SourceMonth, cancellationToken)));

    [HttpPost("{year:int}/{month:int}/from-recurring")]
    public Task<ActionResult<BudgetPageModel>> CreateFromRecurring(
        Guid householdId, int year, int month, CreateBudgetRequest request,
        CancellationToken cancellationToken) =>
        ExecuteWrite(async userId => Ok(await budgetManagementService.CreateFromRecurringAsync(
            householdId, userId, year, month, request.Scope, cancellationToken)));

    [HttpPut("{budgetId:guid}")]
    public Task<ActionResult<BudgetPageModel>> Save(
        Guid householdId, Guid budgetId, SaveBudgetRequest request,
        CancellationToken cancellationToken) =>
        ExecuteWrite(async userId => Ok(await budgetManagementService.SaveAsync(
            householdId, userId, budgetId,
            request.Lines.Select(line => new BudgetLineInput(line.CategoryId, line.BudgetedAmount)).ToList(),
            cancellationToken)));

    [HttpDelete("{budgetId:guid}")]
    public async Task<IActionResult> DeleteDraft(
        Guid householdId,
        Guid budgetId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            await budgetManagementService.DeleteDraftAsync(
                householdId, userId, budgetId, cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{budgetId:guid}/activate")]
    public Task<ActionResult<BudgetPageModel>> Activate(
        Guid householdId, Guid budgetId, CancellationToken cancellationToken) =>
        ExecuteWrite(async userId => Ok(await budgetManagementService.ActivateAsync(
            householdId, userId, budgetId, cancellationToken)));

    [HttpPost("{budgetId:guid}/close")]
    public Task<ActionResult<BudgetPageModel>> Close(
        Guid householdId, Guid budgetId, CancellationToken cancellationToken) =>
        ExecuteWrite(async userId => Ok(await budgetManagementService.CloseAsync(
            householdId, userId, budgetId, cancellationToken)));

    [HttpPost("{budgetId:guid}/reopen")]
    public Task<ActionResult<BudgetPageModel>> Reopen(
        Guid householdId, Guid budgetId, CancellationToken cancellationToken) =>
        ExecuteWrite(async userId => Ok(await budgetManagementService.ReopenAsync(
            householdId, userId, budgetId, cancellationToken)));

    private async Task<ActionResult<BudgetPageModel>> ExecuteRead(
        Func<Guid, Task<BudgetPageModel>> action)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try { return Ok(await action(userId)); }
        catch (Exception exception) when (IsExpected(exception)) { return MapException(exception); }
    }

    private async Task<ActionResult<BudgetPageModel>> ExecuteWrite(
        Func<Guid, Task<ActionResult<BudgetPageModel>>> action)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try { return await action(userId); }
        catch (Exception exception) when (IsExpected(exception)) { return MapException(exception); }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static bool IsExpected(Exception exception) =>
        exception is HouseholdAccessDeniedException or BudgetNotFoundException or
            ArgumentException or InvalidOperationException or DbUpdateConcurrencyException;

    private ObjectResult MapException(Exception exception)
    {
        var (status, title) = exception switch
        {
            HouseholdAccessDeniedException => (StatusCodes.Status403Forbidden, "Household access denied"),
            BudgetNotFoundException => (StatusCodes.Status404NotFound, "Budget not found"),
            DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, "Budget changed"),
            InvalidOperationException when exception.Message.Contains("already exists") =>
                (StatusCodes.Status409Conflict, "Budget already exists"),
            _ => (StatusCodes.Status400BadRequest, "Budget change was rejected")
        };
        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = exception is DbUpdateConcurrencyException
                ? "This budget changed elsewhere. Reload it and try again."
                : exception.Message
        });
    }
}

public sealed record CreateBudgetRequest(string Scope);
public sealed record CopyBudgetRequest(string Scope, int SourceYear, int SourceMonth);
public sealed record SaveBudgetRequest(IReadOnlyList<SaveBudgetLineRequest> Lines);
public sealed record SaveBudgetLineRequest(Guid CategoryId, decimal BudgetedAmount);
