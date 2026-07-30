using System.Security.Claims;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/yearly-plans")]
public sealed class YearlyPlansController(YearlyPlanService service) : ControllerBase
{
    [HttpGet("{fiscalYearStartYear:int}")]
    public Task<ActionResult<YearlyPlanPageModel>> Get(
        Guid householdId,
        int fiscalYearStartYear,
        [FromQuery] string? scope,
        CancellationToken cancellationToken) =>
        ExecuteRead(userId => service.GetAsync(
            householdId,
            userId,
            fiscalYearStartYear,
            scope ?? "Household",
            cancellationToken));

    [HttpPut("{fiscalYearStartYear:int}")]
    public Task<ActionResult<YearlyPlanPageModel>> Save(
        Guid householdId,
        int fiscalYearStartYear,
        SaveYearlyPlanRequest request,
        CancellationToken cancellationToken) =>
        ExecuteWrite(async userId => Ok(await service.SaveAsync(
            householdId,
            userId,
            fiscalYearStartYear,
            request.Scope,
            request.FiscalYearStartMonth,
            request.Lines.Select(line =>
                new YearlyTargetLineInput(
                    line.CategoryId,
                    line.AnnualTargetAmount)).ToList(),
            cancellationToken)));

    [HttpPut("default-start-month")]
    public async Task<ActionResult<ChangeFiscalYearStartMonthResponse>> ChangeDefaultStartMonth(
        Guid householdId,
        ChangeFiscalYearStartMonthRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(new ChangeFiscalYearStartMonthResponse(
                await service.ChangeDefaultStartMonthAsync(
                    householdId,
                    userId,
                    request.FiscalYearStartMonth,
                    cancellationToken)));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{fiscalYearStartYear:int}/allocate")]
    public async Task<ActionResult<YearlyAllocationResult>> Allocate(
        Guid householdId,
        int fiscalYearStartYear,
        AllocateYearlyPlanRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await service.AllocateAsync(
                householdId,
                userId,
                fiscalYearStartYear,
                request.Scope,
                (request.Months ?? []).Select(month =>
                    new YearlyAllocationPeriodInput(
                        month.Year,
                        month.Month)).ToList(),
                request.ReplaceExistingDrafts,
                cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    private async Task<ActionResult<YearlyPlanPageModel>> ExecuteRead(
        Func<Guid, Task<YearlyPlanPageModel>> action)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try { return Ok(await action(userId)); }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    private async Task<ActionResult<YearlyPlanPageModel>> ExecuteWrite(
        Func<Guid, Task<ActionResult<YearlyPlanPageModel>>> action)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try { return await action(userId); }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static bool IsExpected(Exception exception) =>
        exception is HouseholdAccessDeniedException or ArgumentException or
            InvalidOperationException or DbUpdateConcurrencyException;

    private ObjectResult MapException(Exception exception)
    {
        var status = exception switch
        {
            HouseholdAccessDeniedException => StatusCodes.Status403Forbidden,
            DbUpdateConcurrencyException => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };
        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = status == StatusCodes.Status403Forbidden
                ? "Household access denied"
                : "Annual plan change was rejected",
            Detail = exception is DbUpdateConcurrencyException
                ? "This annual plan changed elsewhere. Reload it and try again."
                : exception.Message
        });
    }
}

public sealed record SaveYearlyPlanRequest(
    string Scope,
    int? FiscalYearStartMonth,
    IReadOnlyList<SaveYearlyTargetLineRequest> Lines);

public sealed record SaveYearlyTargetLineRequest(
    Guid CategoryId,
    decimal AnnualTargetAmount);

public sealed record ChangeFiscalYearStartMonthRequest(int FiscalYearStartMonth);

public sealed record ChangeFiscalYearStartMonthResponse(int FiscalYearStartMonth);

public sealed record AllocateYearlyPlanRequest(
    string Scope,
    IReadOnlyList<AllocateYearlyPlanMonthRequest>? Months,
    bool ReplaceExistingDrafts = false);

public sealed record AllocateYearlyPlanMonthRequest(int Year, int Month);
