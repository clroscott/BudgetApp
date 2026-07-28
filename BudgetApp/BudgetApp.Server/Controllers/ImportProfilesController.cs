using System.Security.Claims;
using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/import-profiles")]
public sealed class ImportProfilesController(ImportProfileService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ImportProfileModel>>> List(
        Guid householdId,
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await service.ListAsync(
                householdId, userId, includeInactive, cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPost]
    public async Task<ActionResult<ImportProfileModel>> Create(
        Guid householdId,
        SaveImportProfileInput request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            var result = await service.CreateAsync(
                householdId, userId, request, cancellationToken);
            return Created(
                $"/api/households/{householdId}/import-profiles/{result.Id}",
                result);
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPut("{profileId:guid}")]
    public async Task<ActionResult<ImportProfileModel>> Update(
        Guid householdId,
        Guid profileId,
        SaveImportProfileInput request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await service.UpdateAsync(
                householdId, userId, profileId, request, cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPost("{profileId:guid}/{actionName}")]
    public async Task<IActionResult> SetActive(
        Guid householdId,
        Guid profileId,
        string actionName,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (actionName is not ("deactivate" or "reactivate")) return NotFound();
        try
        {
            await service.SetActiveAsync(
                householdId, userId, profileId,
                actionName == "reactivate", cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpDelete("{profileId:guid}")]
    public async Task<IActionResult> Delete(
        Guid householdId,
        Guid profileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            await service.DeleteAsync(
                householdId, userId, profileId, cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPost("inspect")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ImportProfileInspectionModel>> Inspect(
        Guid householdId,
        [FromForm] Guid accountId,
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (file is null) return BadRequest("Select a CSV file.");
        try
        {
            await using var content = file.OpenReadStream();
            return Ok(await service.InspectAsync(
                householdId, userId, accountId, content, cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpGet("{profileId:guid}/template")]
    public async Task<IActionResult> Template(
        Guid householdId,
        Guid profileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            var template = await service.GetTemplateAsync(
                householdId, userId, profileId, cancellationToken);
            return File(
                System.Text.Encoding.UTF8.GetBytes(template.Content),
                "text/csv",
                template.FileName);
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static bool IsExpected(Exception exception) =>
        exception is HouseholdAccessDeniedException or
            ImportProfileNotFoundException or
            BudgetApp.Application.Accounts.AccountNotFoundException or
            CsvImportRejectedException or
            ArgumentException or
            InvalidOperationException;

    private ObjectResult Map(Exception exception)
    {
        var status = exception switch
        {
            HouseholdAccessDeniedException => StatusCodes.Status403Forbidden,
            ImportProfileNotFoundException => StatusCodes.Status404NotFound,
            BudgetApp.Application.Accounts.AccountNotFoundException =>
                StatusCodes.Status404NotFound,
            _ => StatusCodes.Status400BadRequest
        };
        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = "Import profile request was rejected",
            Detail = exception.Message
        });
    }
}
