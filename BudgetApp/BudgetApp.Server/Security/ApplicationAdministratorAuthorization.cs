using BudgetApp.Infrastructure.Administration;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;

namespace BudgetApp.Server.Security;

public sealed record ApplicationAdministratorRequirement(bool OwnerOnly = false) : IAuthorizationRequirement;
public sealed class ApplicationAdministratorAuthorization(UserManager<ApplicationUser> users, ApplicationAdministratorAccess access)
    : AuthorizationHandler<ApplicationAdministratorRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, ApplicationAdministratorRequirement requirement)
    {
        if (!context.User.HasClaim("amr", "mfa")) return;
        var user = await users.GetUserAsync(context.User);
        if (user is not null && user.EmailConfirmed && user.TwoFactorEnabled && !await users.IsLockedOutAsync(user) &&
            (requirement.OwnerOnly ? await access.IsOwnerAsync(user.Id) : await access.IsDesignatedAsync(user.Id)))
            context.Succeed(requirement);
    }
}
