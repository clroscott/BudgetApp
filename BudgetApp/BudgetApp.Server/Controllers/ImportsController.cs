using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Accounts;
using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/imports")]
public sealed class ImportsController(
    CsvImportService csvImportService,
    ImportReviewService importReviewService,
    ILogger<ImportsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ImportListItem>>> List(
        Guid householdId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            return Ok(await importReviewService.ListAsync(
                householdId, userId, cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpGet("{importFileId:guid}")]
    public async Task<ActionResult<ImportReviewDetail>> Get(
        Guid householdId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            return Ok(await importReviewService.GetAsync(
                householdId, userId, importFileId, cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(CsvImportLimits.MaxRequestSizeBytes)]
    public async Task<ActionResult<CsvImportResult>> Upload(
        Guid householdId,
        [FromForm] Guid accountId,
        [FromForm] IFormFile? file,
        [FromForm] bool allowDuplicateFile,
        [FromForm] Guid? profileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        if (file is null)
        {
            return BadRequestProblem("Select a CSV file to import.");
        }

        if (file.Length > CsvImportLimits.MaxFileSizeBytes)
        {
            return BadRequestProblem(
                $"CSV files cannot exceed {CsvImportLimits.MaxFileSizeBytes / 1024 / 1024} MB.");
        }

        var safeFileName = Path.GetFileName(file.FileName.Replace('\\', '/'));

        try
        {
            await using var content = file.OpenReadStream();
            var result = await csvImportService.UploadAsync(
                householdId,
                userId,
                accountId,
                safeFileName,
                content,
                allowDuplicateFile,
                profileId,
                cancellationToken);
            logger.LogInformation(
                "User {UserId} staged import {ImportFileId} with {TotalRows} rows " +
                "for account {AccountId} in household {HouseholdId}",
                userId,
                result.ImportFileId,
                result.TotalRows,
                accountId,
                householdId);

            return Created(
                $"/api/households/{householdId}/imports/{result.ImportFileId}",
                result);
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{importFileId:guid}/check-duplicates")]
    public async Task<IActionResult> CheckDuplicates(
        Guid householdId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await importReviewService.CheckDuplicatesAsync(
                householdId, userId, importFileId, cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{importFileId:guid}/apply-categorization-rules")]
    public async Task<IActionResult> ApplyCategorizationRules(
        Guid householdId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            var appliedRows = await importReviewService.ApplyCategorizationRulesAsync(
                householdId,
                userId,
                importFileId,
                cancellationToken);
            return Ok(new ApplyCategorizationRulesResponse(appliedRows));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPut("{importFileId:guid}/drafts/{draftId:guid}")]
    public async Task<IActionResult> UpdateDraft(
        Guid householdId,
        Guid importFileId,
        Guid draftId,
        UpdateImportDraftRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await importReviewService.UpdateDraftAsync(
                householdId,
                userId,
                importFileId,
                draftId,
                request.TransactionDate,
                request.Amount,
                request.Description,
                request.SelectedCategoryId,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPut("{importFileId:guid}/drafts")]
    public async Task<ActionResult<BulkUpdateImportDraftsResponse>> BulkUpdateDrafts(
        Guid householdId,
        Guid importFileId,
        BulkUpdateImportDraftsRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            var savedRows = await importReviewService.BulkUpdateDraftsAsync(
                householdId,
                userId,
                importFileId,
                request.Drafts.Select(draft => new ImportDraftUpdateInput(
                    draft.DraftId,
                    draft.TransactionDate,
                    draft.Amount,
                    draft.Description,
                    draft.SelectedCategoryId)).ToList(),
                cancellationToken);
            return Ok(new BulkUpdateImportDraftsResponse(savedRows));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{importFileId:guid}/drafts/{draftId:guid}/decision")]
    public async Task<IActionResult> SetDecision(
        Guid householdId,
        Guid importFileId,
        Guid draftId,
        ReviewImportDraftRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await importReviewService.SetDecisionAsync(
                householdId,
                userId,
                importFileId,
                draftId,
                request.Decision,
                request.AcknowledgePossibleDuplicate,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{importFileId:guid}/decisions")]
    public async Task<IActionResult> SetBulkDecision(
        Guid householdId,
        Guid importFileId,
        BulkReviewImportRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await importReviewService.BulkSetDecisionAsync(
                householdId,
                userId,
                importFileId,
                request.Decision,
                cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpDelete("{importFileId:guid}/drafts/{draftId:guid}")]
    public async Task<IActionResult> RemoveDraft(
        Guid householdId,
        Guid importFileId,
        Guid draftId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await importReviewService.RemoveDraftAsync(
                householdId, userId, importFileId, draftId, cancellationToken);
            logger.LogInformation(
                "User {UserId} removed staged row {DraftId} from import {ImportFileId}",
                userId,
                draftId,
                importFileId);
            return NoContent();
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPost("{importFileId:guid}/complete")]
    public async Task<ActionResult<CompleteImportResult>> Complete(
        Guid householdId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            var result = await importReviewService.CompleteAsync(
                householdId, userId, importFileId, cancellationToken);
            logger.LogInformation(
                "User {UserId} completed import {ImportFileId} and created {TransactionCount} transactions",
                userId,
                importFileId,
                result.CreatedTransactionCount);
            return Ok(result);
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpDelete("{importFileId:guid}")]
    public async Task<IActionResult> Discard(
        Guid householdId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        try
        {
            await importReviewService.DiscardAsync(
                householdId, userId, importFileId, cancellationToken);
            logger.LogInformation(
                "User {UserId} discarded staged import {ImportFileId} in household {HouseholdId}",
                userId,
                importFileId,
                householdId);
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
            AccountNotFoundException or
            ImportNotFoundException or
            ImportDraftNotFoundException or
            CategoryNotFoundException or
            DuplicateCsvImportException or
            CsvImportRejectedException or
            ArgumentException or
            InvalidOperationException;

    private ObjectResult MapException(Exception exception)
    {
        var (status, title) = exception switch
        {
            HouseholdAccessDeniedException =>
                (StatusCodes.Status403Forbidden, "Household access denied"),
            AccountNotFoundException =>
                (StatusCodes.Status404NotFound, "Account not found"),
            ImportNotFoundException =>
                (StatusCodes.Status404NotFound, "Import not found"),
            ImportDraftNotFoundException =>
                (StatusCodes.Status404NotFound, "Import row not found"),
            CategoryNotFoundException =>
                (StatusCodes.Status400BadRequest, "Category not found"),
            DuplicateCsvImportException =>
                (StatusCodes.Status409Conflict, "Possible duplicate file"),
            _ => (StatusCodes.Status400BadRequest, "CSV import was rejected")
        };

        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = exception.Message
        });
    }

    private ObjectResult BadRequestProblem(string detail) =>
        BadRequest(new ProblemDetails
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "CSV import was rejected",
            Detail = detail
        });
}

public sealed record UpdateImportDraftRequest(
    DateOnly? TransactionDate,
    decimal? Amount,
    [param: StringLength(500)] string? Description,
    Guid? SelectedCategoryId);

public sealed record BulkUpdateImportDraftsRequest(
    [param: Required, MinLength(1)]
    IReadOnlyList<BulkUpdateImportDraftItemRequest> Drafts);

public sealed record BulkUpdateImportDraftItemRequest(
    Guid DraftId,
    DateOnly? TransactionDate,
    decimal? Amount,
    [param: StringLength(500)] string? Description,
    Guid? SelectedCategoryId);

public sealed record BulkUpdateImportDraftsResponse(int SavedRows);

public sealed record ReviewImportDraftRequest(
    [param: Required] string Decision,
    bool AcknowledgePossibleDuplicate);

public sealed record BulkReviewImportRequest(
    [param: Required] string Decision);

public sealed record ApplyCategorizationRulesResponse(int AppliedRows);
