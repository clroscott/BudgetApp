using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/settings")]
public sealed class HouseholdSettingsController(HouseholdSettingsService service) : ControllerBase
{
    [HttpGet]
    public Task<ActionResult<HouseholdSettingsModel>> Get(Guid householdId, CancellationToken cancellationToken) =>
        Execute(userId => service.GetAsync(householdId, userId, cancellationToken));

    [HttpPut]
    public Task<ActionResult<HouseholdSettingsModel>> Save(Guid householdId, SaveHouseholdSettingsRequest request,
        CancellationToken cancellationToken) => Execute(userId => service.SaveAsync(householdId, userId,
            request.Name, request.DefaultCurrency, request.TimeZoneId, request.FiscalYearStartMonth,
            request.Version!.Value, cancellationToken));

    private async Task<ActionResult<HouseholdSettingsModel>> Execute(Func<Guid, Task<HouseholdSettingsModel>> operation)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        try { return Ok(await operation(userId)); }
        catch (HouseholdAccessDeniedException) { return Forbid(); }
        catch (ArgumentException exception)
        {
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [exception.ParamName ?? "settings"] = [exception.Message] }));
        }
        catch (InvalidOperationException exception) when (exception is HouseholdSettingsConflictException or HouseholdCurrencyLockedException)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "Household settings could not be saved", Detail = exception.Message });
        }
    }
}

public sealed record SaveHouseholdSettingsRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string DefaultCurrency,
    [param: Required, StringLength(100, MinimumLength = 1)] string TimeZoneId,
    [param: Range(1, 12)] int FiscalYearStartMonth,
    [param: Required] DateTimeOffset? Version);
