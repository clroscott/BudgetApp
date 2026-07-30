using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BudgetApp.Application.Tutorials;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/tutorial-progress")]
public sealed class TutorialProgressController(TutorialProgressService service)
    : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TutorialProgressModel>>> List(
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        return Ok(await service.ListAsync(userId, cancellationToken));
    }

    [HttpPut("{tutorialKey}")]
    public async Task<ActionResult<TutorialProgressModel>> Save(
        string tutorialKey,
        SaveTutorialProgressRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        try
        {
            return Ok(await service.SaveAsync(
                userId,
                tutorialKey,
                request.TutorialVersion,
                request.Status,
                request.CurrentStepIndex,
                cancellationToken));
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Tutorial progress was rejected",
                Detail = exception.Message
            });
        }
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
}

public sealed record SaveTutorialProgressRequest(
    [param: Range(1, int.MaxValue)] int TutorialVersion,
    [param: Required] string Status,
    [param: Range(0, int.MaxValue)] int CurrentStepIndex);
