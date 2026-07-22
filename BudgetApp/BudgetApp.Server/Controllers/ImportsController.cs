using System.Security.Claims;
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
    ILogger<ImportsController> logger) : ControllerBase
{
    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(CsvImportLimits.MaxRequestSizeBytes)]
    public async Task<ActionResult<CsvImportResult>> Upload(
        Guid householdId,
        [FromForm] Guid accountId,
        [FromForm] IFormFile? file,
        [FromForm] bool allowDuplicateFile,
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

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static bool IsExpected(Exception exception) =>
        exception is HouseholdAccessDeniedException or
            AccountNotFoundException or
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
