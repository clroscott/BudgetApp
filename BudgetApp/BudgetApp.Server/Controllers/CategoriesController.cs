using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/categories")]
public sealed class CategoriesController(
    CategoryManagementService categoryManagementService,
    ILogger<CategoriesController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CategoryTreeItem>>> List(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(await categoryManagementService.ListAsync(
                householdId,
                userId,
                cancellationToken));
        }
        catch (HouseholdAccessDeniedException exception)
        {
            return Forbidden(exception);
        }
    }

    [HttpPost]
    public async Task<ActionResult<CreateCategoryResponse>> Create(
        Guid householdId,
        CreateCategoryRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var categoryId = await categoryManagementService.CreateAsync(
                householdId,
                userId,
                request.Name,
                request.Type,
                request.ParentCategoryId,
                cancellationToken);
            logger.LogInformation(
                "User {UserId} created category {CategoryId} in household {HouseholdId}",
                userId,
                categoryId,
                householdId);

            return Created(
                $"/api/households/{householdId}/categories",
                new CreateCategoryResponse(categoryId));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPut("{categoryId:guid}")]
    public async Task<IActionResult> Update(
        Guid householdId,
        Guid categoryId,
        UpdateCategoryRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await categoryManagementService.UpdateAsync(
                householdId,
                userId,
                categoryId,
                request.Name,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPut("order")]
    public async Task<IActionResult> Reorder(
        Guid householdId,
        ReorderCategoriesRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await categoryManagementService.ReorderAsync(
                householdId,
                userId,
                request.CategoryIds,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{categoryId:guid}/deactivate")]
    public Task<IActionResult> Deactivate(
        Guid householdId,
        Guid categoryId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, categoryId, isActive: false, cancellationToken);

    [HttpPost("{categoryId:guid}/reactivate")]
    public Task<IActionResult> Reactivate(
        Guid householdId,
        Guid categoryId,
        CancellationToken cancellationToken) =>
        SetActive(householdId, categoryId, isActive: true, cancellationToken);

    private async Task<IActionResult> SetActive(
        Guid householdId,
        Guid categoryId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await categoryManagementService.SetActiveAsync(
                householdId,
                userId,
                categoryId,
                isActive,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static bool IsExpected(Exception exception) =>
        exception is HouseholdAccessDeniedException or
            CategoryNotFoundException or
            CategoryConflictException or
            ArgumentException or
            InvalidOperationException;

    private ObjectResult MapException(Exception exception)
    {
        var (status, title) = exception switch
        {
            HouseholdAccessDeniedException =>
                (StatusCodes.Status403Forbidden, "Household access denied"),
            CategoryNotFoundException =>
                (StatusCodes.Status404NotFound, "Category not found"),
            CategoryConflictException =>
                (StatusCodes.Status409Conflict, "Category already exists"),
            _ => (StatusCodes.Status400BadRequest, "Category change was rejected")
        };

        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = exception.Message
        });
    }

    private ObjectResult Forbidden(Exception exception) =>
        StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails
        {
            Status = StatusCodes.Status403Forbidden,
            Title = "Household access denied",
            Detail = exception.Message
        });
}

public sealed record CreateCategoryRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name,
    string? Type,
    Guid? ParentCategoryId);

public sealed record UpdateCategoryRequest(
    [param: Required, StringLength(100, MinimumLength = 1)] string Name);

public sealed record ReorderCategoriesRequest(
    [param: Required, MinLength(1)] IReadOnlyList<Guid> CategoryIds);

public sealed record CreateCategoryResponse(Guid Id);
