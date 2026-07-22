using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households")]
public sealed class HouseholdsController(
    HouseholdOnboardingService householdOnboardingService,
    ILogger<HouseholdsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<HouseholdResponse>>> GetMine(
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var memberships = await householdOnboardingService
            .GetActiveMembershipsAsync(userId, cancellationToken);

        return Ok(memberships.Select(ToResponse));
    }

    [HttpPost]
    public async Task<ActionResult<HouseholdResponse>> CreateInitial(
        CreateHouseholdRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var membership = await householdOnboardingService
                .CreateInitialHouseholdAsync(
                    userId,
                    request.Name,
                    request.DefaultCurrency,
                    request.TimeZoneId,
                    cancellationToken);

            logger.LogInformation(
                "Created household {HouseholdId} for owner {UserId}",
                membership.HouseholdId,
                userId);

            return Created("/api/households", ToResponse(membership));
        }
        catch (HouseholdMembershipExistsException exception)
        {
            return Conflict(new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Household setup is already complete",
                Detail = exception.Message
            });
        }
        catch (ArgumentException exception)
        {
            return ValidationProblem(new ValidationProblemDetails(
                new Dictionary<string, string[]>
                {
                    [exception.ParamName ?? "household"] = [exception.Message]
                }));
        }
    }

    private bool TryGetUserId(out Guid userId)
    {
        return Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
    }

    private static HouseholdResponse ToResponse(HouseholdMembership membership) =>
        new(
            membership.HouseholdId,
            membership.Name,
            membership.DefaultCurrency,
            membership.TimeZoneId,
            membership.Role.ToString());
}

public sealed record CreateHouseholdRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string DefaultCurrency,
    [param: Required, StringLength(100, MinimumLength = 1)] string TimeZoneId);

public sealed record HouseholdResponse(
    Guid Id,
    string Name,
    string DefaultCurrency,
    string TimeZoneId,
    string Role);
