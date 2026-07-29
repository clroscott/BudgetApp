using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Accounts;
using BudgetApp.Application.Categories;
using BudgetApp.Application.CategorizationRules;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/categorization-rules")]
public sealed class CategorizationRulesController(
    CategorizationRuleManagementService service,
    ILogger<CategorizationRulesController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CategorizationRuleItem>>> List(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            return Ok(await service.ListAsync(
                householdId,
                userId,
                cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPost]
    public async Task<ActionResult<CreateCategorizationRuleResponse>> Create(
        Guid householdId,
        SaveCategorizationRuleRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            var id = await service.CreateAsync(
                householdId,
                userId,
                request.Name,
                request.MatchField,
                request.MatchOperator,
                request.MatchValue,
                request.AccountId,
                request.TargetCategoryId,
                cancellationToken);
            logger.LogInformation(
                "User {UserId} created categorization rule {RuleId} in household {HouseholdId}",
                userId,
                id,
                householdId);
            return Created(
                $"/api/households/{householdId}/categorization-rules/{id}",
                new CreateCategorizationRuleResponse(id));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPut("{ruleId:guid}")]
    public async Task<IActionResult> Update(
        Guid householdId,
        Guid ruleId,
        SaveCategorizationRuleRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await service.UpdateAsync(
                householdId,
                userId,
                ruleId,
                request.Name,
                request.MatchField,
                request.MatchOperator,
                request.MatchValue,
                request.AccountId,
                request.TargetCategoryId,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPut("order")]
    public async Task<IActionResult> Reorder(
        Guid householdId,
        ReorderCategorizationRulesRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await service.ReorderAsync(
                householdId,
                userId,
                request.RuleIds,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    [HttpPost("{ruleId:guid}/deactivate")]
    public Task<IActionResult> Deactivate(
        Guid householdId,
        Guid ruleId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, ruleId, isActive: false, cancellationToken);

    [HttpPost("{ruleId:guid}/reactivate")]
    public Task<IActionResult> Reactivate(
        Guid householdId,
        Guid ruleId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, ruleId, isActive: true, cancellationToken);

    [HttpDelete("{ruleId:guid}")]
    public async Task<IActionResult> Delete(
        Guid householdId,
        Guid ruleId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await service.DeleteAsync(
                householdId,
                userId,
                ruleId,
                cancellationToken);
            logger.LogInformation(
                "User {UserId} permanently deleted categorization rule {RuleId} in household {HouseholdId}",
                userId,
                ruleId,
                householdId);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return Map(exception);
        }
    }

    private async Task<IActionResult> SetActive(
        Guid householdId,
        Guid ruleId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await service.SetActiveAsync(
                householdId,
                userId,
                ruleId,
                isActive,
                cancellationToken);
            return NoContent();
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
            CategorizationRuleNotFoundException or
            CategorizationRuleConflictException or
            CategoryNotFoundException or
            AccountNotFoundException or
            ArgumentException or
            InvalidOperationException;

    private ObjectResult Map(Exception exception)
    {
        var (status, title) = exception switch
        {
            HouseholdAccessDeniedException =>
                (StatusCodes.Status403Forbidden, "Household access denied"),
            CategorizationRuleNotFoundException =>
                (StatusCodes.Status404NotFound, "Categorization rule not found"),
            CategorizationRuleConflictException =>
                (StatusCodes.Status409Conflict, "Categorization rule already exists"),
            CategoryNotFoundException =>
                (StatusCodes.Status400BadRequest, "Category not found"),
            AccountNotFoundException =>
                (StatusCodes.Status400BadRequest, "Account not found"),
            _ => (StatusCodes.Status400BadRequest, "Categorization rule was rejected")
        };

        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = exception.Message
        });
    }
}

public sealed record SaveCategorizationRuleRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name,
    [param: Required] string MatchField,
    [param: Required] string MatchOperator,
    [param: Required, StringLength(200, MinimumLength = 1)] string MatchValue,
    Guid? AccountId,
    Guid TargetCategoryId);

public sealed record ReorderCategorizationRulesRequest(
    [param: Required, MinLength(1)] IReadOnlyList<Guid> RuleIds);

public sealed record CreateCategorizationRuleResponse(Guid Id);
