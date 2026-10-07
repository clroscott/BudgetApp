using System.ComponentModel.DataAnnotations;
using BudgetApp.Application.Authentication;

namespace BudgetApp.Infrastructure.Administration;

public sealed record AdministrativeActionRequest(Guid OperationId, Guid TargetUserId,
    [param: Required, StringLength(50)] string Action,
    [param: Required, StringLength(500, MinimumLength = 5)] string Reason,
    [param: Required, StringLength(100)] string Version,
    [param: Required, StringLength(128)] string CurrentPassword,
    [param: StringLength(32)] string? GrantVersion = null);
public sealed record CompleteAdministrativeActionRequest(AdministrativeActionRequest Request,
    [param: Required] VerificationProof Proof);
public sealed record ResendAdministrativeCodeRequest(AdministrativeActionRequest Request, Guid ChallengeId);
public sealed record AdministrativeActionResult(Guid OperationId, string Outcome, string Message);
public sealed record AdministrativeAccount(Guid Id, string DisplayName, string Email, bool EmailConfirmed,
    bool MfaEnabled, DateTimeOffset? LockedUntilUtc, string Version, bool IsApplicationAdministrator,
    string? AdministratorRole = null, string? AdministratorVersion = null);
public sealed record AdministrativeAuditItem(Guid Id, Guid ActorUserId, Guid TargetUserId, string Action,
    string Reason, string Outcome, DateTimeOffset OccurredAtUtc);
public sealed class AdministrationException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}
