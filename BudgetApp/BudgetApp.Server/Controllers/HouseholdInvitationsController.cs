using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/households/{householdId:guid}")]
public sealed class HouseholdInvitationsController(
    HouseholdInvitationService invitationService) : ControllerBase
{
    [HttpGet("members")]
    public async Task<ActionResult<HouseholdMemberManagementResponse>>
        GetManagement(
            Guid householdId,
            CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(ToResponse(
                await invitationService.GetManagementAsync(
                    householdId,
                    userId,
                    cancellationToken)));
        }
        catch (HouseholdAccessDeniedException)
        {
            return Forbid();
        }
    }

    [HttpPost("invitations")]
    public async Task<ActionResult<HouseholdInvitationDispatchResponse>> Create(
        Guid householdId,
        CreateHouseholdInvitationRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        if (!Enum.TryParse<HouseholdRole>(
                request.Role,
                ignoreCase: true,
                out var role))
        {
            return InvalidRole();
        }

        try
        {
            var dispatch = await invitationService.CreateAsync(
                householdId,
                userId,
                request.Email,
                role,
                cancellationToken);

            return Created(
                $"/api/households/{householdId}/invitations/{dispatch.Invitation.Id}",
                ToResponse(dispatch));
        }
        catch (HouseholdAccessDeniedException)
        {
            return Forbid();
        }
        catch (HouseholdInvitationConflictException exception)
        {
            return ConflictProblem(exception.Message);
        }
        catch (ArgumentException exception)
        {
            return ValidationProblem(new ValidationProblemDetails(
                new Dictionary<string, string[]>
                {
                    [exception.ParamName ?? "email"] = [exception.Message]
                }));
        }
    }

    [HttpPost("invitations/{invitationId:guid}/resend")]
    public async Task<ActionResult<HouseholdInvitationDispatchResponse>> Resend(
        Guid householdId,
        Guid invitationId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(ToResponse(
                await invitationService.ResendAsync(
                    householdId,
                    invitationId,
                    userId,
                    cancellationToken)));
        }
        catch (HouseholdAccessDeniedException)
        {
            return Forbid();
        }
        catch (HouseholdInvitationNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException exception)
        {
            return ConflictProblem(exception.Message);
        }
    }

    [HttpPost("invitations/{invitationId:guid}/revoke")]
    public async Task<IActionResult> Revoke(
        Guid householdId,
        Guid invitationId,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await invitationService.RevokeAsync(
                householdId,
                invitationId,
                userId,
                cancellationToken);
            return NoContent();
        }
        catch (HouseholdAccessDeniedException)
        {
            return Forbid();
        }
        catch (HouseholdInvitationNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException exception)
        {
            return ConflictProblem(exception.Message);
        }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            out userId);

    private ActionResult InvalidRole() =>
        ValidationProblem(new ValidationProblemDetails(
            new Dictionary<string, string[]>
            {
                ["role"] =
                [
                    "Choose Admin, Editor, or Viewer. Owner cannot be assigned by invitation."
                ]
            }));

    private ObjectResult ConflictProblem(string detail) =>
        Conflict(new ProblemDetails
        {
            Status = StatusCodes.Status409Conflict,
            Title = "Household invitation conflict",
            Detail = detail
        });

    private static HouseholdMemberManagementResponse ToResponse(
        HouseholdMemberManagement management) =>
        new(
            management.CanManageInvitations,
            management.Members.Select(member => new HouseholdMemberResponse(
                member.UserId,
                member.DisplayName,
                member.Email,
                member.Role.ToString(),
                member.Status.ToString(),
                member.JoinedAtUtc)).ToList(),
            management.Invitations.Select(ToResponse).ToList(),
            new HouseholdExitOptionsResponse(
                management.ExitOptions.CanLeave,
                management.ExitOptions.CanDeleteUnused,
                management.ExitOptions.BlockedReason));

    private static HouseholdInvitationResponse ToResponse(
        HouseholdInvitationItem invitation) =>
        new(
            invitation.Id,
            invitation.Email,
            invitation.Role.ToString(),
            invitation.Status,
            invitation.CreatedAtUtc,
            invitation.LastSentAtUtc,
            invitation.ExpiresAtUtc);

    private static HouseholdInvitationDispatchResponse ToResponse(
        HouseholdInvitationDispatch dispatch) =>
        new(ToResponse(dispatch.Invitation), dispatch.EmailDelivered);
}

[ApiController]
[Route("api/household-invitations")]
public sealed class HouseholdInvitationAcceptanceController(
    HouseholdInvitationService invitationService) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("preview")]
    public async Task<ActionResult<HouseholdInvitationPreviewResponse>> Preview(
        [FromQuery, Required, StringLength(512)] string token,
        CancellationToken cancellationToken)
    {
        try
        {
            var preview = await invitationService.GetPreviewAsync(
                token,
                cancellationToken);
            return Ok(new HouseholdInvitationPreviewResponse(
                preview.HouseholdName,
                preview.InviterDisplayName,
                preview.MaskedEmail,
                preview.Role.ToString(),
                preview.ExpiresAtUtc,
                preview.IsAvailable,
                preview.Status));
        }
        catch (HouseholdInvitationUnavailableException)
        {
            return NotFound(new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Invitation unavailable",
                Detail = "This invitation is invalid or no longer available."
            });
        }
    }

    [Authorize]
    [HttpPost("accept")]
    public async Task<ActionResult<HouseholdResponse>> Accept(
        AcceptHouseholdInvitationRequest request,
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
            var membership = await invitationService.AcceptAsync(
                userId,
                request.Token,
                cancellationToken);
            return Ok(new HouseholdResponse(
                membership.HouseholdId,
                membership.Name,
                membership.DefaultCurrency,
                membership.TimeZoneId,
                membership.Role.ToString()));
        }
        catch (HouseholdInvitationEmailMismatchException exception)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                new ProblemDetails
                {
                    Status = StatusCodes.Status403Forbidden,
                    Title = "Invitation email does not match",
                    Detail = exception.Message
                });
        }
        catch (HouseholdInvitationUnavailableException exception)
        {
            return StatusCode(
                StatusCodes.Status410Gone,
                new ProblemDetails
                {
                    Status = StatusCodes.Status410Gone,
                    Title = "Invitation unavailable",
                    Detail = exception.Message
                });
        }
    }
}

public sealed record CreateHouseholdInvitationRequest(
    [param: Required, EmailAddress, StringLength(256)] string Email,
    [param: Required, StringLength(20)] string Role);

public sealed record AcceptHouseholdInvitationRequest(
    [param: Required, StringLength(512)] string Token);

public sealed record HouseholdMemberManagementResponse(
    bool CanManageInvitations,
    IReadOnlyList<HouseholdMemberResponse> Members,
    IReadOnlyList<HouseholdInvitationResponse> Invitations,
    HouseholdExitOptionsResponse ExitOptions);

public sealed record HouseholdExitOptionsResponse(
    bool CanLeave,
    bool CanDeleteUnused,
    string? BlockedReason);

public sealed record HouseholdMemberResponse(
    Guid UserId,
    string DisplayName,
    string Email,
    string Role,
    string Status,
    DateTimeOffset? JoinedAtUtc);

public sealed record HouseholdInvitationResponse(
    Guid Id,
    string Email,
    string Role,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset LastSentAtUtc,
    DateTimeOffset ExpiresAtUtc);

public sealed record HouseholdInvitationDispatchResponse(
    HouseholdInvitationResponse Invitation,
    bool EmailDelivered);

public sealed record HouseholdInvitationPreviewResponse(
    string HouseholdName,
    string InviterDisplayName,
    string MaskedEmail,
    string Role,
    DateTimeOffset ExpiresAtUtc,
    bool IsAvailable,
    string Status);
