using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Transactions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}/transactions")]
public sealed class TransactionsController(
    TransactionManagementService transactionManagementService,
    ILogger<TransactionsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<TransactionListResult>> List(
        Guid householdId,
        [FromQuery] Guid? accountId,
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(await transactionManagementService.ListAsync(
                householdId,
                userId,
                accountId,
                fromDate,
                toDate,
                cancellationToken));
        }
        catch (Exception exception) when (IsExpected(exception))
        {
            return MapException(exception);
        }
    }

    [HttpPut("{transactionId:guid}")]
    public async Task<IActionResult> Update(
        Guid householdId,
        Guid transactionId,
        UpdateTransactionRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await transactionManagementService.UpdateAsync(
                householdId,
                userId,
                transactionId,
                request.CategoryId,
                request.TransactionDate,
                request.PostedDate,
                request.Amount,
                request.Description,
                request.MerchantName,
                request.Notes,
                request.IsExcludedFromBudget,
                cancellationToken);
            logger.LogInformation(
                "User {UserId} updated transaction {TransactionId} in household {HouseholdId}",
                userId,
                transactionId,
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
            TransactionNotFoundException or
            CategoryNotFoundException or
            ArgumentException or
            InvalidOperationException;

    private ObjectResult MapException(Exception exception)
    {
        var (status, title) = exception switch
        {
            HouseholdAccessDeniedException =>
                (StatusCodes.Status403Forbidden, "Household access denied"),
            TransactionNotFoundException =>
                (StatusCodes.Status404NotFound, "Transaction not found"),
            CategoryNotFoundException =>
                (StatusCodes.Status400BadRequest, "Category not found"),
            _ => (StatusCodes.Status400BadRequest, "Transaction change was rejected")
        };

        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = exception.Message
        });
    }
}

public sealed record UpdateTransactionRequest(
    Guid? CategoryId,
    DateOnly TransactionDate,
    DateOnly? PostedDate,
    decimal Amount,
    [param: Required, StringLength(Transaction.DescriptionMaxLength, MinimumLength = 1)]
    string Description,
    [param: StringLength(Transaction.MerchantNameMaxLength)] string? MerchantName,
    [param: StringLength(Transaction.NotesMaxLength)] string? Notes,
    bool IsExcludedFromBudget);
