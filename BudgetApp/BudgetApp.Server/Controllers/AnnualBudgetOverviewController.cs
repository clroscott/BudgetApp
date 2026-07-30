using System.Security.Claims;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/annual-budget-overview")]
public sealed class AnnualBudgetOverviewController(
    AnnualBudgetOverviewService service) : ControllerBase
{
    [HttpGet("{year:int}")]
    public async Task<ActionResult<AnnualBudgetOverviewModel>> Get(
        Guid householdId,
        int year,
        [FromQuery] string? scope,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(
                User.FindFirstValue(ClaimTypes.NameIdentifier),
                out var userId))
            return Unauthorized();

        try
        {
            return Ok(await service.GetAsync(
                householdId,
                userId,
                year,
                scope ?? "Household",
                cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Household access denied",
                Detail = exception.Message
            });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Annual overview request was rejected",
                Detail = exception.Message
            });
        }
    }
}
