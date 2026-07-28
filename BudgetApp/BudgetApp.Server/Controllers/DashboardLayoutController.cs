using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Dashboards;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/dashboard-layout")]
public sealed class DashboardLayoutController(
    DashboardLayoutService dashboardLayoutService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<DashboardLayoutModel>> Get(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await dashboardLayoutService.GetAsync(
                householdId, userId, cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return Forbidden(exception);
        }
    }

    [HttpPut]
    public async Task<ActionResult<DashboardLayoutModel>> Save(
        Guid householdId,
        SaveDashboardLayoutRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await dashboardLayoutService.SaveAsync(
                householdId,
                userId,
                request.PreferredColumnCount,
                request.VisiblePanelKeys,
                cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return Forbidden(exception);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Dashboard layout was rejected",
                Detail = exception.Message
            });
        }
    }

    [HttpDelete]
    public async Task<ActionResult<DashboardLayoutModel>> Reset(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await dashboardLayoutService.ResetAsync(
                householdId, userId, cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return Forbidden(exception);
        }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private ObjectResult Forbidden(Exception exception) =>
        StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails
        {
            Status = StatusCodes.Status403Forbidden,
            Title = "Household access denied",
            Detail = exception.Message
        });
}

public sealed record SaveDashboardLayoutRequest(
    [param: Range(1, 12)] int PreferredColumnCount,
    [param: Required] IReadOnlyList<string> VisiblePanelKeys);
