using System.Security.Claims;
using BudgetApp.Application.Dashboards;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/dashboard-summary")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class DashboardSummaryController(DashboardSummaryService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<DashboardSummaryModel>> Get(
        Guid householdId, [FromQuery] int year, [FromQuery] int month,
        [FromQuery] string scope = "Household", [FromQuery] bool includeRecent = false,
        CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        try
        {
            return Ok(await service.GetAsync(householdId, userId, year, month, scope, includeRecent, cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return StatusCode(403, new ProblemDetails { Status = 403, Title = "Household access denied", Detail = exception.Message });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new ProblemDetails { Status = 400, Title = "Dashboard context was rejected", Detail = exception.Message });
        }
    }
}
