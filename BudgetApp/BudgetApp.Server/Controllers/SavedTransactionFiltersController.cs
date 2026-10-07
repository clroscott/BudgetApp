using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Households;
using BudgetApp.Application.Transactions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/transaction-filters")]
public sealed class SavedTransactionFiltersController(SavedTransactionFilterService service) : ControllerBase
{
    [HttpGet]
    public Task<IActionResult> List(Guid householdId, CancellationToken token) =>
        Execute(user => service.ListAsync(householdId, user, token));
    [HttpGet("{id:guid}")]
    public Task<IActionResult> Get(Guid householdId, Guid id, CancellationToken token) =>
        Execute(user => service.GetAsync(householdId, user, id, token));
    [HttpPut("{id:guid}")]
    public Task<IActionResult> Create(Guid householdId, Guid id, SaveTransactionFilterRequest request, CancellationToken token) =>
        Execute(user => service.CreateAsync(householdId, user, id, request.Name, request.Filters, token));
    [HttpPut("{id:guid}/name")]
    public Task<IActionResult> Rename(Guid householdId, Guid id, RenameTransactionFilterRequest request, CancellationToken token) =>
        Execute(user => service.RenameAsync(householdId, user, id, request.Name, request.Version, token));
    [HttpDelete("{id:guid}")]
    public Task<IActionResult> Delete(Guid householdId, Guid id, [FromQuery] Guid version, CancellationToken token) =>
        Execute(async user => { await service.DeleteAsync(householdId, user, id, version, token); return new { }; });

    private async Task<IActionResult> Execute<T>(Func<Guid, Task<T>> action)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var user)) return Unauthorized();
        try { return Ok(await action(user)); }
        catch (Exception error) when (error is HouseholdAccessDeniedException or SavedFilterNotFoundException or SavedFilterConflictException or ArgumentException)
        {
            var status = error switch
            {
                HouseholdAccessDeniedException => 403, SavedFilterNotFoundException => 404,
                SavedFilterConflictException => 409, _ => 400
            };
            return StatusCode(status, new ProblemDetails { Status = status, Title = "Saved filter request failed", Detail = error.Message });
        }
    }
}
public sealed record SaveTransactionFilterRequest([param: Required, StringLength(100)] string Name,
    [param: Required] SavedTransactionFilterDefinition Filters);
public sealed record RenameTransactionFilterRequest([param: Required, StringLength(100)] string Name, Guid Version);
