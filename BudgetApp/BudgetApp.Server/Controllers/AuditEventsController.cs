using System.Security.Claims;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/audit-events")]
public sealed class AuditEventsController(
    AuditQueryService auditQueryService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AuditEventListResult>> List(
        Guid householdId,
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        [FromQuery] Guid? actorUserId,
        [FromQuery] string? action,
        [FromQuery] string? entityType,
        [FromQuery] int page,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(
                User.FindFirstValue(ClaimTypes.NameIdentifier),
                out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(await auditQueryService.ListAsync(
                householdId,
                userId,
                fromDate,
                toDate,
                actorUserId,
                action,
                entityType,
                page == 0 ? 1 : page,
                cancellationToken));
        }
        catch (HouseholdAccessDeniedException)
        {
            return Forbid();
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Audit history filter was rejected",
                Detail = exception.Message
            });
        }
    }
}
